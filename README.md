# aws-cdk-cloudfront-websockets-vpc-origins

Amazon CloudFront の WebSocket Support for VPC Origins (2026/05/01 発表) の動作確認用 CDK プロジェクト。完全プライベートサブネット内の ECS Fargate 上で動く WebSocket チャットアプリに、CloudFront 経由で `wss://` 接続する構成を最小コードで再現する。

- 出典: [Amazon CloudFront Announces WebSocket Support for VPC Origins](https://aws.amazon.com/about-aws/whats-new/2026/05/amazon-cloudfront-websockets-vpc-origins/)
- 関連: [Use WebSockets with CloudFront distributions](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/distribution-working-with.websockets.html) / [Restrict access with VPC origins](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-vpc-origins.html)

## アーキテクチャ

```
[Browser / wscat]
       │ wss:443 (TLS)
       ▼
[CloudFront Distribution]
       │ HTTP:80 (VPC Origin, AWS internal routing)
       ▼
[Internal ALB]   in PRIVATE_ISOLATED subnet (2 AZ)
       │ HTTP:8080
       ▼
[Fargate Task x1]   Node.js + ws + pino
       │
       ├─ stdout (JSON) ─> awslogs ─> CloudWatch Logs
       └─ ECR / CloudWatch Logs pull via VPC Endpoints
```

- VPC: PRIVATE_ISOLATED ✕ 2AZ。NAT Gateway なし
- IGW: VPC にアタッチのみ (PRIVATE_ISOLATED サブネットからのルートなし)。CloudFront VPC Origin の要件
- VPC Endpoints: Interface (`ECR_API` / `ECR_DOCKER` / `CLOUDWATCH_LOGS`) を 1 AZ に集約 + Gateway (`S3`)
- ECS Fargate: 1 タスク、ローリングアップデート (`minHealthyPercent: 0` / `maxHealthyPercent: 200`)
- CloudFront:
  - `OriginRequestPolicy.ALL_VIEWER` (`Sec-WebSocket-*` ヘッダ転送のため必須)
  - `CachePolicy.CACHING_DISABLED` (WebSocket レスポンスはキャッシュ不可)
  - `AllowedMethods.ALLOW_ALL`、`REDIRECT_TO_HTTPS`

## ディレクトリ構成

```
bin/aws-cdk-cloudfront-websockets-vpc-origins.ts   # CDK App エントリ
lib/
├── aws-cdk-cloudfront-websockets-vpc-origins-stack.ts
└── construct/
    ├── vpc-construct.ts        # VPC + IGW + VPC Endpoints
    ├── alb-construct.ts        # Internal ALB + TargetGroup + Listener
    ├── ecs-construct.ts        # Cluster + TaskDefinition + Service
    └── cloudfront-construct.ts # VpcOrigin + Distribution
src/container/app/
├── Dockerfile                  # node:24-alpine
├── package.json                # ws + pino
├── server.mjs                  # HTTP routing + WebSocket handler
└── index.html                  # ブラウザ用チャット UI (CSS/JS 内蔵)
test/
├── helpers.ts                  # cdk.json の context を読み込んだ Template 生成
├── snapshot.test.ts            # スナップショット 1 本
└── assertions.test.ts          # Fine-grained Assertions 10 件
```

## アプリケーション

`src/container/app/server.mjs` は echo + broadcast 型のシンプルチャットサーバ。

| パス | プロトコル | 用途 |
|------|----------|------|
| `GET /` | HTTP | チャット UI (`index.html`) を返す |
| `GET /health` | HTTP | ALB / コンテナのヘルスチェック (`200 {"status":"ok"}`) |
| Upgrade `/websocket` | WebSocket | チャット接続 (welcome + echo + broadcast) |
| その他 GET / Upgrade | - | `404` |

接続時の挙動:

1. クライアント接続 → サーバが UUID を発行、`{type:"welcome", id, clientCount}` を返す
2. クライアントが送信 → 送信元に `{type:"echo", from, message}`、他クライアントに `{type:"broadcast", from, message}`
3. 切断 → ログ出力

全イベントを pino で構造化 JSON ログとして stdout に出力 → awslogs ドライバ経由で CloudWatch Logs に転送。

## 前提

- Node.js 22+
- pnpm 11+
- AWS CDK CLI 2.1122+
- Docker (Fargate コンテナイメージのローカルビルド用)
- AWS 認証 (`awsume` などで CDK 実行用クレデンシャル)

## セットアップ

```bash
pnpm install
```

依存ビルドスクリプト (`esbuild`, `unrs-resolver`) は `pnpm-workspace.yaml` の `onlyBuiltDependencies` で許可済み。

## デプロイ

```bash
# 初回のみ CDK ブートストラップ
cdk bootstrap

# デプロイ
cdk deploy
```

デプロイ完了後、Outputs から CloudFront ドメインが取得できる:

```bash
aws cloudformation describe-stacks \
  --stack-name AwsCdkCloudfrontWebsocketsVpcOriginsStack \
  --query 'Stacks[0].Outputs'
```

VPC Origin の `Status: Deployed` 反映には CloudFront 全体の伝播 (約 5-15 分) を要する場合がある:

```bash
aws cloudfront list-vpc-origins --query 'Items[].Status'
```

## 動作確認

### ブラウザ

```bash
open https://<distribution-domain>.cloudfront.net/
```

チャット UI が表示される。別タブで同じ URL を開くと相互に broadcast が届く。

### CLI (wscat)

```bash
npx wscat -c wss://<distribution-domain>.cloudfront.net/websocket
> hello
< {"type":"echo","from":"...","message":"hello"}
```

### ヘルスチェック

```bash
curl -i https://<distribution-domain>.cloudfront.net/health
# HTTP/2 200
# {"status":"ok"}
```

### CloudWatch Logs

```bash
aws logs tail "<log-group-name>" --since 5m --follow
```

ロググループ名は `aws logs describe-log-groups --query 'logGroups[?contains(logGroupName, \`AwsCdkCloudfrontWebsockets\`) && !contains(logGroupName, \`containerinsights\`)].logGroupName'` で取得できる。

## テスト

```bash
pnpm test
```

- `snapshot.test.ts`: CloudFormation テンプレート全体のスナップショット
- `assertions.test.ts`: Fine-grained Assertions (VPC Origin / Distribution / Subnet / ECS Service 等)

スナップショットを更新したい場合:

```bash
pnpm exec jest -u
```

## ローカルでアプリ単体を動かす

CDK を介さず WebSocket サーバを直接動かす場合:

```bash
cd src/container/app
# pnpm install --ignore-scripts  # 親 workspace の影響を回避
node server.mjs
```

別ターミナルで:

```bash
curl http://localhost:8080/health           # HTTP 200
curl http://localhost:8080/                 # チャット UI HTML
npx wscat -c ws://localhost:8080/websocket  # WebSocket 接続
```

## クリーンアップ

```bash
cdk destroy
```

VPC Origin は CloudFront 全体の伝播を待つため、削除完了まで時間がかかる場合がある。

## 注意事項

- このプロジェクトは **WebSocket VPC Origins の動作確認用** であり、本番運用を意図していない
- ALB ↔ Fargate 間は HTTP (平文)。エンドツーエンド TLS が必要な場合は別途証明書と HTTPS リスナーの追加が必要
- Fargate タスクは 1 つのみ。複数タスクにスケールする場合、in-memory `Map` でクライアント管理している現状の `server.mjs` ではタスク間で broadcast が届かなくなる
- WebSocket のメッセージ・接続情報には認証/認可がない

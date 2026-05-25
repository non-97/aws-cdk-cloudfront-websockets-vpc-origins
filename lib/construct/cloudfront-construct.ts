import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

export interface CloudfrontConstructProps {
  readonly alb: cdk.aws_elasticloadbalancingv2.IApplicationLoadBalancer;
}

export class CloudfrontConstruct extends Construct {
  readonly distribution: cdk.aws_cloudfront.IDistribution;

  constructor(scope: Construct, id: string, props: CloudfrontConstructProps) {
    super(scope, id);

    const vpcOrigin =
      cdk.aws_cloudfront_origins.VpcOrigin.withApplicationLoadBalancer(
        props.alb,
        {
          protocolPolicy: cdk.aws_cloudfront.OriginProtocolPolicy.HTTP_ONLY,
          httpPort: 80,
          readTimeout: cdk.Duration.seconds(30),
          keepaliveTimeout: cdk.Duration.seconds(5),
        }
      );

    const distribution = new cdk.aws_cloudfront.Distribution(this, "Default", {
      defaultBehavior: {
        origin: vpcOrigin,
        viewerProtocolPolicy:
          cdk.aws_cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cdk.aws_cloudfront.AllowedMethods.ALLOW_ALL,
        // WebSocket レスポンスはキャッシュ不可
        cachePolicy: cdk.aws_cloudfront.CachePolicy.CACHING_DISABLED,
        // Sec-WebSocket-* ヘッダを全て転送する必要があるため ALL_VIEWER を使用
        originRequestPolicy: cdk.aws_cloudfront.OriginRequestPolicy.ALL_VIEWER,
        responseHeadersPolicy:
          cdk.aws_cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
      },
      priceClass: cdk.aws_cloudfront.PriceClass.PRICE_CLASS_100,
      minimumProtocolVersion:
        cdk.aws_cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: cdk.aws_cloudfront.HttpVersion.HTTP2,
      enableIpv6: true,
    });

    new cdk.CfnOutput(this, "DistributionDomainName", {
      value: `https://${distribution.distributionDomainName}`,
      description:
        "CloudFront distribution domain (use wss:// scheme for WebSocket)",
    });

    new cdk.CfnOutput(this, "WebSocketEndpoint", {
      value: `wss://${distribution.distributionDomainName}/`,
      description: "WebSocket endpoint for client connections",
    });

    this.distribution = distribution;
  }
}

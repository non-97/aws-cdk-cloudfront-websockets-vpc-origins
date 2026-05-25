import { Match } from "aws-cdk-lib/assertions";
import { getTemplate } from "./helpers";

// CloudFront managed policy IDs
// ref: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html
// ref: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-origin-request-policies.html
const CACHING_DISABLED_POLICY_ID = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad";
const ALL_VIEWER_POLICY_ID = "216adef6-5c7f-47e4-b989-5492eafa07d3";

describe("CloudFront VPC Origin (WebSocket)", () => {
  test("VPC Origin が 1 つ作成される", () => {
    const template = getTemplate();
    template.resourceCountIs("AWS::CloudFront::VpcOrigin", 1);
  });

  test("VPC Origin は ALB 向けに HTTP_ONLY / port 80 で設定される", () => {
    const template = getTemplate();
    template.hasResourceProperties("AWS::CloudFront::VpcOrigin", {
      VpcOriginEndpointConfig: Match.objectLike({
        HTTPPort: 80,
        OriginProtocolPolicy: "http-only",
      }),
    });
  });

  test("Distribution はキャッシュ無効 / ALL_VIEWER OriginRequestPolicy を使う", () => {
    const template = getTemplate();
    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({
        DefaultCacheBehavior: Match.objectLike({
          CachePolicyId: CACHING_DISABLED_POLICY_ID,
          OriginRequestPolicyId: ALL_VIEWER_POLICY_ID,
          ViewerProtocolPolicy: "redirect-to-https",
        }),
      }),
    });
  });
});

describe("VPC", () => {
  test("Interface Endpoint 3 個 + Gateway Endpoint 1 個 = 4 個", () => {
    const template = getTemplate();
    template.resourceCountIs("AWS::EC2::VPCEndpoint", 4);
  });

  test("パブリックサブネットを作らない (全 Subnet で MapPublicIpOnLaunch=false)", () => {
    const template = getTemplate();
    const subnets = template.findResources("AWS::EC2::Subnet");
    for (const [logicalId, subnet] of Object.entries(subnets)) {
      const props = (subnet as { Properties: Record<string, unknown> }).Properties;
      expect(props.MapPublicIpOnLaunch).toBe(false);
    }
  });

  test("NAT Gateway を作らない", () => {
    const template = getTemplate();
    template.resourceCountIs("AWS::EC2::NatGateway", 0);
  });

  test("Internet Gateway は VPC にアタッチされる (CloudFront VPC Origin の必須要件)", () => {
    const template = getTemplate();
    template.resourceCountIs("AWS::EC2::InternetGateway", 1);
    template.resourceCountIs("AWS::EC2::VPCGatewayAttachment", 1);
  });

  test("IGW を指すルートは存在しない (PRIVATE_ISOLATED のみ、外部疎通は不可)", () => {
    const template = getTemplate();
    const routes = template.findResources("AWS::EC2::Route");
    for (const [, route] of Object.entries(routes)) {
      const props = (route as { Properties: Record<string, unknown> }).Properties;
      expect(props.GatewayId).toBeUndefined();
    }
  });
});

describe("ECS Service", () => {
  test("desiredCount=1, ローリングアップデート (0/200)", () => {
    const template = getTemplate();
    template.hasResourceProperties("AWS::ECS::Service", {
      DesiredCount: 1,
      DeploymentConfiguration: Match.objectLike({
        MinimumHealthyPercent: 0,
        MaximumPercent: 200,
      }),
    });
  });
});

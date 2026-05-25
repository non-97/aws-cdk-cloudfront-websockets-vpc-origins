import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

export class VpcConstruct extends Construct {
  readonly vpc: cdk.aws_ec2.IVpc;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const vpc = new cdk.aws_ec2.Vpc(this, "Default", {
      ipAddresses: cdk.aws_ec2.IpAddresses.cidr("10.10.8.0/22"),
      enableDnsHostnames: true,
      enableDnsSupport: true,
      natGateways: 0,
      maxAzs: 2,
      subnetConfiguration: [
        {
          name: "Isolated",
          subnetType: cdk.aws_ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
      gatewayEndpoints: {
        S3: {
          service: cdk.aws_ec2.GatewayVpcEndpointAwsService.S3,
        },
      },
    });

    // CloudFront VPC Origin は「VPC に IGW がアタッチされていること」を必須要件とする
    // (実際のルーティングには使われない。AWS 内部バックボーン経由でオリジンに到達するため)
    // L2 Vpc は PUBLIC subnet が無いと IGW を作らないため、L1 で明示的にアタッチする
    const igw = new cdk.aws_ec2.CfnInternetGateway(this, "InternetGateway");
    new cdk.aws_ec2.CfnVPCGatewayAttachment(this, "InternetGatewayAttachment", {
      vpcId: vpc.vpcId,
      internetGatewayId: igw.ref,
    });

    // Interface endpoints はコスト削減のため 1 AZ のみに配置する
    // (Fargate は 2 AZ に分散させるため、ENI 経由の通信はクロス AZ になりうる)
    const endpointSubnets: cdk.aws_ec2.SubnetSelection = {
      subnets: [vpc.isolatedSubnets[0]],
    };

    vpc.addInterfaceEndpoint("EcrApiEndpoint", {
      service: cdk.aws_ec2.InterfaceVpcEndpointAwsService.ECR,
      subnets: endpointSubnets,
    });

    vpc.addInterfaceEndpoint("EcrDockerEndpoint", {
      service: cdk.aws_ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
      subnets: endpointSubnets,
    });

    vpc.addInterfaceEndpoint("CloudWatchLogsEndpoint", {
      service: cdk.aws_ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
      subnets: endpointSubnets,
    });

    this.vpc = vpc;
  }
}

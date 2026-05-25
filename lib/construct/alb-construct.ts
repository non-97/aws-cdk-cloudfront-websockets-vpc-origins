import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

export interface AlbConstructProps {
  readonly vpc: cdk.aws_ec2.IVpc;
}

export class AlbConstruct extends Construct {
  readonly alb: cdk.aws_elasticloadbalancingv2.IApplicationLoadBalancer;
  readonly targetGroup: cdk.aws_elasticloadbalancingv2.ApplicationTargetGroup;

  constructor(scope: Construct, id: string, props: AlbConstructProps) {
    super(scope, id);

    const alb = new cdk.aws_elasticloadbalancingv2.ApplicationLoadBalancer(
      this,
      "Default",
      {
        vpc: props.vpc,
        internetFacing: false,
        vpcSubnets: { subnetType: cdk.aws_ec2.SubnetType.PRIVATE_ISOLATED },
        idleTimeout: cdk.Duration.seconds(60),
      }
    );

    const targetGroup =
      new cdk.aws_elasticloadbalancingv2.ApplicationTargetGroup(
        this,
        "TargetGroup",
        {
          vpc: props.vpc,
          protocol: cdk.aws_elasticloadbalancingv2.ApplicationProtocol.HTTP,
          port: 8080,
          targetType: cdk.aws_elasticloadbalancingv2.TargetType.IP,
          healthCheck: {
            path: "/health",
            port: "8080",
            protocol: cdk.aws_elasticloadbalancingv2.Protocol.HTTP,
            healthyHttpCodes: "200",
            interval: cdk.Duration.seconds(15),
            timeout: cdk.Duration.seconds(5),
            healthyThresholdCount: 2,
          },
          // WebSocket draining 中の切断を緩和するため検証用に短めに設定
          deregistrationDelay: cdk.Duration.seconds(30),
        }
      );

    alb.addListener("Listener", {
      port: 80,
      protocol: cdk.aws_elasticloadbalancingv2.ApplicationProtocol.HTTP,
      defaultTargetGroups: [targetGroup],
    });

    this.alb = alb;
    this.targetGroup = targetGroup;
  }
}

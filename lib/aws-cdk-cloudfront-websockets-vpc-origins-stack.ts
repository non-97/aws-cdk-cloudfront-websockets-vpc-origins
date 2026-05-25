import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { VpcConstruct } from "./construct/vpc-construct";
import { AlbConstruct } from "./construct/alb-construct";
import { EcsConstruct } from "./construct/ecs-construct";
import { CloudfrontConstruct } from "./construct/cloudfront-construct";

export class AwsCdkCloudfrontWebsocketsVpcOriginsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpcConstruct = new VpcConstruct(this, "Vpc");

    const albConstruct = new AlbConstruct(this, "Alb", {
      vpc: vpcConstruct.vpc,
    });

    new EcsConstruct(this, "Ecs", {
      vpc: vpcConstruct.vpc,
      targetGroup: albConstruct.targetGroup,
    });

    new CloudfrontConstruct(this, "Cloudfront", {
      alb: albConstruct.alb,
    });
  }
}

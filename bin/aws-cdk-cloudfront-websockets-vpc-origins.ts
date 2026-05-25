#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { AwsCdkCloudfrontWebsocketsVpcOriginsStack } from "../lib/aws-cdk-cloudfront-websockets-vpc-origins-stack";

const app = new cdk.App();

new AwsCdkCloudfrontWebsocketsVpcOriginsStack(
  app,
  "AwsCdkCloudfrontWebsocketsVpcOriginsStack",
  {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
    },
  }
);

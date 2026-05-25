import * as fs from "node:fs";
import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { AwsCdkCloudfrontWebsocketsVpcOriginsStack } from "../lib/aws-cdk-cloudfront-websockets-vpc-origins-stack";

const getContext = (): Record<string, unknown> => {
  const cdkJsonPath = path.join(__dirname, "..", "cdk.json");
  const cdkJson = JSON.parse(fs.readFileSync(cdkJsonPath, "utf-8"));
  return (cdkJson.context as Record<string, unknown>) ?? {};
};

export const getTemplate = (): Template => {
  const app = new cdk.App({
    context: {
      ...getContext(),
    },
  });
  const stack = new AwsCdkCloudfrontWebsocketsVpcOriginsStack(app, "TestStack", {
    env: { account: "123456789012", region: "us-east-1" },
  });
  return Template.fromStack(stack);
};

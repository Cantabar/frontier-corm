#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { FrontierCormStack } from "../lib/frontier-corm-stack";

const app = new cdk.App();

new FrontierCormStack(app, "FrontierCorm", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.AWS_REGION ?? "us-east-1",
  },
  tags: {
    Project: "frontier-corm",
    Environment: "hackathon",
  },
});

#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { FrontierCormStack } from "../lib/frontier-corm-stack";

const app = new cdk.App();

// appEnv determines which game-world environment to deploy:
//   cdk deploy -c appEnv=utopia   → FrontierCormUtopia stack
//   cdk deploy -c appEnv=stillness → FrontierCormStillness stack
const appEnv: string = app.node.tryGetContext("appEnv") ?? "utopia";
const stackId = `FrontierCorm${appEnv.charAt(0).toUpperCase()}${appEnv.slice(1)}`;

new FrontierCormStack(app, stackId, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.AWS_REGION ?? "us-east-1",
  },
  tags: {
    Project: "frontier-corm",
    Environment: appEnv,
  },
});

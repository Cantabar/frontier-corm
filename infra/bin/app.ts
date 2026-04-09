#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { FrontierCormStack } from "../lib/frontier-corm-stack";
import { FrontierCormFrontendStack } from "../lib/frontend-stack";

const app = new cdk.App();

// appEnv determines which game-world environment to deploy:
//   cdk deploy -c appEnv=utopia         → FrontierCormUtopia stack (full infra)
//   cdk deploy -c appEnv=stillness      → FrontierCormStillness stack (full infra)
//   cdk deploy -c appEnv=post-hackathon → FrontierCormPostHackathonStack (frontend-only)
const appEnv: string = app.node.tryGetContext("appEnv") ?? "utopia";

// Frontend-only environments: static S3 + CloudFront that proxy to an
// existing backend. No VPC, ECS, RDS, or ECR resources are created.
const frontendOnlyEnvs: Record<
  string,
  { stackId: string; siteDomain: string; apiDomain: string }
> = {
  "post-hackathon": {
    stackId: "FrontierCormPostHackathonStack",
    siteDomain: "post-hackathon.stillness.ef-corm.com",
    apiDomain: "api.ef-corm.com",
  },
};

const stackProps: cdk.StackProps = {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.AWS_REGION ?? "us-east-1",
  },
  tags: {
    Project: "frontier-corm",
    Environment: appEnv,
  },
};

const feConfig = frontendOnlyEnvs[appEnv];
if (feConfig) {
  new FrontierCormFrontendStack(app, feConfig.stackId, {
    ...stackProps,
    frontendDomain: feConfig.siteDomain,
    apiBackendDomain: feConfig.apiDomain,
  });
} else {
  const stackId = `FrontierCorm${appEnv.charAt(0).toUpperCase()}${appEnv.slice(1)}`;
  new FrontierCormStack(app, stackId, stackProps);
}

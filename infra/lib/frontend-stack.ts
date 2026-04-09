import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";

export interface FrontierCormFrontendStackProps extends cdk.StackProps {
  /** Full domain for this frontend (e.g. post-hackathon.stillness.ef-corm.com) */
  frontendDomain: string;
  /** Existing API domain to proxy /api/v1/* and /zk/* to (e.g. api.ef-corm.com) */
  apiBackendDomain: string;
}

/**
 * Frontend-only CDK stack.
 *
 * Provisions S3, CloudFront, Route 53, and an ACM certificate for a static
 * web UI that proxies API/RPC requests to an existing backend environment.
 * No VPC, ECS, RDS, or ECR resources are created.
 */
export class FrontierCormFrontendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FrontierCormFrontendStackProps) {
    super(scope, id, props);

    // ================================================================
    // Context / Props
    // ================================================================
    const { frontendDomain, apiBackendDomain } = props;
    const suiNetwork: string = this.node.tryGetContext("suiNetwork") ?? "testnet";
    const prefix = `fc-${this.node.tryGetContext("appEnv") ?? "frontend"}`;

    const suiRpcUrls: Record<string, string> = {
      testnet: "https://fullnode.testnet.sui.io:443",
      mainnet: "https://fullnode.mainnet.sui.io:443",
    };
    const suiRpcUrl = suiRpcUrls[suiNetwork] ?? suiRpcUrls.testnet;

    // ================================================================
    // Route 53 — look up existing hosted zone
    // ================================================================
    const rootDomain = "ef-corm.com";
    const zone = route53.HostedZone.fromLookup(this, "Zone", {
      domainName: rootDomain,
    });

    // ================================================================
    // ACM Certificate — specific to this frontend domain
    // ================================================================
    const certificate = new acm.Certificate(this, "Certificate", {
      domainName: frontendDomain,
      validation: acm.CertificateValidation.fromDns(zone),
    });

    // ================================================================
    // S3 — Frontend static assets
    // ================================================================
    const uiBucket = new s3.Bucket(this, "UiBucket", {
      bucketName: `${prefix}-ui-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const cfLogBucket = new s3.Bucket(this, "CfLogBucket", {
      bucketName: `${prefix}-cf-logs-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      objectOwnership: s3.ObjectOwnership.OBJECT_WRITER,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [{ expiration: cdk.Duration.days(30) }],
    });

    // ================================================================
    // CloudFront
    // ================================================================

    // Sui RPC reverse-proxy origin
    const suiFullnodeHost = suiRpcUrl.replace(/^https?:\/\//, "").replace(/:.*/, "");
    const suiOrigin = new origins.HttpOrigin(suiFullnodeHost, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
    });

    // Existing backend ALB origin (Stillness API)
    const albOrigin = new origins.HttpOrigin(apiBackendDomain, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
    });

    // CloudFront Function: rewrite /sui-rpc → /
    const suiRpcRewrite = new cloudfront.Function(this, "SuiRpcRewrite", {
      functionName: `${prefix}-sui-rpc-rewrite`,
      code: cloudfront.FunctionCode.fromInline(
        `function handler(event) { event.request.uri = '/'; return event.request; }`
      ),
    });

    const distribution = new cloudfront.Distribution(this, "CfDistribution", {
      domainNames: [frontendDomain],
      certificate,
      logBucket: cfLogBucket,
      logFilePrefix: `${prefix}/`,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(uiBucket),
        viewerProtocolPolicy:
          cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      additionalBehaviors: {
        "/sui-rpc": {
          origin: suiOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy:
            cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          functionAssociations: [
            {
              function: suiRpcRewrite,
              eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
            },
          ],
        },
        "/api/v1/*": {
          origin: albOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy:
            cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
        "/zk/*": {
          origin: albOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          originRequestPolicy:
            cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
      defaultRootObject: "index.html",
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
        },
      ],
    });

    // ================================================================
    // Route 53 — DNS record
    // ================================================================
    new route53.ARecord(this, "SiteAliasRecord", {
      zone,
      recordName: frontendDomain,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.CloudFrontTarget(distribution)
      ),
    });

    // ================================================================
    // Outputs
    // ================================================================
    new cdk.CfnOutput(this, "SiteUrl", {
      value: `https://${frontendDomain}`,
      description: "Frontend URL",
    });

    new cdk.CfnOutput(this, "UiBucketName", {
      value: uiBucket.bucketName,
      description: "S3 bucket for frontend deploy",
    });

    new cdk.CfnOutput(this, "CloudFrontDistributionId", {
      value: distribution.distributionId,
      description: "CloudFront distribution ID (for cache invalidation)",
    });
  }
}

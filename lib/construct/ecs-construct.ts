import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

export interface EcsConstructProps {
  readonly vpc: cdk.aws_ec2.IVpc;
  readonly targetGroup: cdk.aws_elasticloadbalancingv2.ApplicationTargetGroup;
}

export class EcsConstruct extends Construct {
  readonly cluster: cdk.aws_ecs.ICluster;
  readonly service: cdk.aws_ecs.FargateService;

  constructor(scope: Construct, id: string, props: EcsConstructProps) {
    super(scope, id);

    const cluster = new cdk.aws_ecs.Cluster(this, "Cluster", {
      vpc: props.vpc,
      containerInsightsV2: cdk.aws_ecs.ContainerInsights.ENHANCED,
    });

    const taskDefinition = new cdk.aws_ecs.FargateTaskDefinition(
      this,
      "TaskDefinition",
      {
        cpu: 256,
        memoryLimitMiB: 512,
        runtimePlatform: {
          cpuArchitecture: cdk.aws_ecs.CpuArchitecture.ARM64,
          operatingSystemFamily: cdk.aws_ecs.OperatingSystemFamily.LINUX,
        },
      }
    );

    const logGroup = new cdk.aws_logs.LogGroup(this, "LogGroup", {
      retention: cdk.aws_logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    taskDefinition.addContainer("App", {
      containerName: "app",
      image: cdk.aws_ecs.ContainerImage.fromAsset(
        path.join(__dirname, "../../src/container/app"),
        {
          platform: cdk.aws_ecr_assets.Platform.LINUX_ARM64,
        }
      ),
      essential: true,
      portMappings: [{ containerPort: 8080 }],
      environment: {
        PORT: "8080",
      },
      healthCheck: {
        command: [
          "CMD-SHELL",
          "wget -q -O - http://localhost:8080/health || exit 1",
        ],
        interval: cdk.Duration.seconds(15),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(10),
      },
      linuxParameters: new cdk.aws_ecs.LinuxParameters(this, "LinuxParameters", {
        initProcessEnabled: true,
      }),
      logging: cdk.aws_ecs.LogDrivers.awsLogs({
        streamPrefix: "app",
        logGroup,
      }),
    });

    const service = new cdk.aws_ecs.FargateService(this, "Service", {
      cluster,
      taskDefinition,
      desiredCount: 1,
      // 1 タスクでローリングアップデート可能にする
      minHealthyPercent: 0,
      maxHealthyPercent: 200,
      vpcSubnets: { subnetType: cdk.aws_ec2.SubnetType.PRIVATE_ISOLATED },
      assignPublicIp: false,
      circuitBreaker: { rollback: true },
      healthCheckGracePeriod: cdk.Duration.seconds(30),
      enableExecuteCommand: true,
    });

    service.attachToApplicationTargetGroup(props.targetGroup);

    this.cluster = cluster;
    this.service = service;
  }
}

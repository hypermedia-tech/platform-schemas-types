import {
    ContainerHpaProperties,
    ContainerPortConfig,
    ContainerProbeProperties,
    ContainerResourceProperties,
    Environment,
    EnvironmentVariableObj,
    SecretObj
} from "../shared";


export interface BasicContainerRolloutSchema {
    workloadType: "BASIC_CONTAINER_ROLLOUT"
    serviceName: string;
    environment: Environment;
    namespace?: string;
    serviceCatalog: string;
    serviceAccount?: string;
    revisionHistoryLimit?: number;
    basicMonitoring?: {
        enabled: boolean;
    }
    container: {
        vault?: {
            key: string;
        };
        secretStore?: {
            name: string;
        };
        replicas: number;
        image: {
            repository: string;
            tag: string;
        };
        containerPorts?: ContainerPortConfig[];

        hpa?: ContainerHpaProperties;
        livenessProbe?: ContainerProbeProperties;
        readinessProbe?: ContainerProbeProperties;
        resources: ContainerResourceProperties;
        secretRefreshInterval?: string;
        environment?: EnvironmentVariableObj[];
        secrets?: SecretObj[];
    };
    ingress?: {
        enabled: boolean;
        host: string;
    };
    nameOverride?: string;
    service?: {
        port?: number;
    };
    rollout: {
        analysis?: {
            enabled: boolean;
            initialDelay: string;
            duration: string;
            successRate: number;
            maxP95Latency: number;
            maxErrorRate: number;
        };
        strategy: {
            canary: {
                maxUnavailable: number;
                maxSurge: number;
                steps: Record<string, any>[]
            }
        }
    }
}
import {
    ContainerHpaProperties,
    ContainerPortConfig,
    ContainerProbeProperties,
    ContainerResourceProperties,
    Environment,
    EnvironmentVariableObj,
    SecretObj, Stripe
} from "../shared";


export interface BasicContainerLoadSchema {
    workloadType: "BASIC_CONTAINER_LOAD"
    serviceName: string;
    environment: Environment;
    stripe: Stripe;
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
}
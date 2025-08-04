import {
    ContainerHpaProperties,
    ContainerPortConfig,
    ContainerProbeProperties,
    ContainerResourceProperties,
    ContainerStorageProperties,
    Environment,
    EnvironmentVariableObj,
    SecretObj
} from "../shared";


export interface StatefulContainerLoadSchema {
    workloadType: "STATEFUL_CONTAINER_LOAD"
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
        storage: ContainerStorageProperties;
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
import {
    ContainerPortConfig,
    ContainerProbeProperties,
    ContainerResourceProperties,
    Environment,
    EnvironmentVariableObj,
    SecretObj
} from "../shared";

export interface MlInferenceLoadSchema {
    workloadType: "ML_INFERENCE_LOAD";
    serviceName: string;
    environment: Environment;
    namespace?: string;
    serviceCatalog: string;
    serviceAccount?: string;
    revisionHistoryLimit?: number;

    model: {
        id: string;
        revision: string;
    };

    inference?: {
        maxInputLength?: number;
        maxTotalTokens?: number;
    };

    gpu: {
        count: number;
    };

    container: {
        secretStore?: {
            name: string;
        };
        replicas: number;
        image: {
            repository: string;
            tag: string;
        };
        containerPorts?: ContainerPortConfig[];
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

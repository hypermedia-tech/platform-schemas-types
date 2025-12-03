import {
    ContainerPortConfig,
    ContainerProbeProperties,
    ContainerResourceProperties,
    Environment,
    EnvironmentVariableObj
} from "../shared";

export interface OllamaInferenceLoadSchema {
    workloadType: "OLLAMA_INFERENCE_LOAD";
    serviceName: string;
    environment: Environment;
    namespace?: string;
    serviceCatalog: string;
    serviceAccount?: string;
    revisionHistoryLimit?: number;

    gpu: {
        count: number;
    };

    container: {
        replicas: number;
        image: {
            repository: string;
            tag: string;
        };
        containerPorts?: ContainerPortConfig[];
        livenessProbe?: ContainerProbeProperties;
        readinessProbe?: ContainerProbeProperties;
        resources: ContainerResourceProperties;
        environment?: EnvironmentVariableObj[];
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

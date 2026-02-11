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

    models: {
        primary: string;
        additional?: string[];
    };

    gpu: {
        enabled: boolean;
        type?: "nvidia" | "amd";
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

    storage?: {
        enabled: boolean;
        size: string;
        storageClass?: string;
        accessMode?: string;
    };

    nameOverride?: string;
    service?: {
        port?: number;
    };
}

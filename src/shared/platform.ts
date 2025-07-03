import { kebabCase } from 'lodash';
import { WorkloadSchema } from "../workloadChartValues";
export interface AsyncOperationResponse<T> {
    ok: boolean;
    data: T | null;
    error?: string;
}


export interface GitHubResponse<T> extends AsyncOperationResponse<T>{
    errorType?: 'NOT_FOUND' | 'INVALID_YAML' | 'INVALID_RESPONSE' | 'NETWORK_ERROR';
}

export interface WorkloadConfigurationDataProps {
    environment: Environment;
    stripe?: Stripe;
    workloadName: string;
    catalogName: string;
}

export interface DeploymentCatalogConfigPathParams {
    catalogName: string;
}

export interface DeploymentCatalogConfigPayload {

}

export interface SimpleHttpResponseMessage {
    status: SimpleHttpResponseStatus,
    message: string
}

export interface WorkloadConfigurationUpdateResponse extends SimpleHttpResponseMessage {}

export const SimpleHttpResponseStatuses = {
    OK: "OK",
    ERROR: "ERROR",
    PENDING: "PENDING"
}

export type SimpleHttpResponseStatus = (
    typeof SimpleHttpResponseStatuses
    )[ keyof typeof SimpleHttpResponseStatuses ]

export const Environments = {
    DEV: 'dev',
    SYST: 'syst',
    UAT: 'uat',
    PROD: 'prod',
    GITOPS: 'gitops',
    GITOPS_DEV: 'gitops-dev'
} as const;

export type Environment = ( typeof Environments )[ keyof typeof Environments ];

export const Stripes = {
    ACTIVE: "active",
    UNDEFINED: "undefined",
    INDIGO: "indigo",
    GREEN: "green",
    BLUE: "blue",
    RED: "red",
    YELLOW: "yellow",
    VIOLET: "violet",
    ORANGE: "orange",
    WHITE: "white"
} as const;

export type Stripe = ( typeof Stripes )[ keyof typeof Stripes ];

export const ORDERED_STRIPES: Stripe[] = [
    Stripes.INDIGO,
    Stripes.GREEN,
    Stripes.BLUE,
    Stripes.RED,
    Stripes.YELLOW,
    Stripes.VIOLET,
    Stripes.ORANGE
] as const;

export const ORDERED_ENVIRONMENTS: Environment[] = [
    Environments.DEV,
    Environments.SYST,
    Environments.UAT
]

export const ORDERED_GITOPS_ENVIRONMENTS: Environment[] = [
    Environments.GITOPS_DEV,
    Environments.GITOPS
]

export interface HelmChartManifest {
    apiVersion: 'v1' | 'v2' | 'v3';
    appVersion: string;
    description?: string;
    name: string;
    version: string;
}

export interface WorkloadConfigurationUpdateRequestPathParams {
    catalogName: string;
    environment: Environment;
    stripe: Stripe;
    workloadName: string;
}

export interface WorkloadConfigurationUpdateRequestPayload {
    catalogName: string;
    workloadName: string;
    environment: Environment;
    stripe: Stripe;
    values: WorkloadSchema,
    updatedValues: WorkloadSchema
}

export interface KustomizeConfigBaseType {
    apiVersion: 'kustomize.config.k8s.io/v1beta1'
}

export interface KustomizationHelmChart {
    name: string;
    repo: string;
    version: string;
    valuesFile: string;
    namespace: string;
}

export interface Kustomization extends KustomizeConfigBaseType {
    kind: 'Kustomization'
}

export interface CatalogKustomization extends Kustomization {
    helmGlobals: {
        chartHome: string;
    }
    helmCharts: KustomizationHelmChart[]
}

export interface WorkloadEnvironmentConfig {
    targetCluster: string;
    chartRepository: string;
    chartName: string;
    chartVersion: string;
    env: Environment;
    stripe: Stripe;
    projectName: string;
    namespace: string;
    releaseName: string;
}

export interface ArgoApplication {
    apiVersion: 'argoproj.io/v1alpha1'
    kind: 'Application';
    metadata: {
        name: string;
        namespace: string;
    }
    spec: {
        project: string;
        source: {
            repoURL: string;
            targetRevision: string;
            path: string;
        }
        destination: {
            name: string;
            namespace: string
        }
        syncPolicy: {
            automated:{
                prune: boolean;
                selfHeal: boolean;
                allowEmpty: boolean;
            }
            syncOptions: string[]
            retry: {
                limit: number;
                backoff: {
                    duration: string;
                    factor: number
                    maxDuration: string;
                }
            }
        }
    }
}

export type ApplicationSetGenerators = ApplicationSetGitGenerator | ApplicationSetMatrixGenerator | ApplicationSetClustersGenerator

// TODO: Typeguards

export const isApplicationSetGitGenerator = ( obj: ApplicationSetGenerators ): obj is ApplicationSetGitGenerator => {
    return 'git' in obj &&
        obj.git &&
        typeof obj.git === 'object' &&
        typeof obj.git.repoURL === 'string' &&
        typeof obj.git.revision === 'string'
};

export const isApplicationSetClusterGenerator = (obj: ApplicationSetGenerators ): obj is ApplicationSetClustersGenerator => {
    return 'clusters' in obj &&
        obj.clusters &&
        typeof obj.clusters === 'object' &&
        obj.clusters !== null;
}

export const isApplicationSetMatrixGenerator = (obj: ApplicationSetGenerators ): obj is ApplicationSetMatrixGenerator => {
    return 'matrix' in obj &&
        typeof obj.matrix === 'object' &&
        obj.matrix !== null &&
        obj.matrix.generators &&
        Array.isArray(obj.matrix.generators)
}

export interface ApplicationSet {
    apiVersion: 'argoproj.io/v1alpha1'
    kind: 'ApplicationSet';
    metadata: {
        name: string;
        namespace: string;
        finalizers?: string[];
    }
    spec: {
        goTemplate: boolean;
        goTemplateOptions: string[];
        generators: (ApplicationSetGenerators)[];
        template: {
            metadata: {
                name: string;
            }
            spec: {
                project: string;
                sources: ApplicationSetSource[]
                destination: {
                    name?: string
                    server?: string
                    namespace: string
                }
                syncPolicy: {
                    automated: {
                        prune: boolean
                        selfHeal: boolean
                    }
                }
            }
        }
    }
}

export interface ApplicationSetSource {
    repoURL: string;
    chart?: string;
    targetRevision: string;
    helm?: {
        releaseName: string;
        ignoreMissingValueFiles: boolean;
        valueFiles?: string[];
    }
    ref?: string;
}

export interface ApplicationSetGenerator {
    repoURL: string;
    revision: string;
    files: ApplicationSetGeneratorFile[]
}

export interface ApplicationSetGeneratorFile {
    path: string;
}

export interface ApplicationSetGitGenerator {
    git: {
        repoURL: string;
        revision: string;
        files?: ApplicationSetGeneratorFile[];
        directories?: ApplicationSetGeneratorDirectory[];
    };
}

export interface ApplicationSetMatrixGenerator {
    matrix: {
        generators: (ApplicationSetGitGenerator | ApplicationSetClustersGenerator)[];
    };
}

export interface ApplicationSetClustersGenerator {
    clusters: {};
}

export interface ApplicationSetGeneratorFile {
    path: string;
}

export interface ApplicationSetGeneratorDirectory {
    path: string;
}

export interface CatalogPatchItem {
    op: "replace" | "add";
    path: string;
    value: any;
}

export const DeploymentTriggers = {
    MANUAL: "MANUAL",
    E2E: "E2E",
    AUTO: "AUTO"
} as const;

export type DeploymentTrigger = ( typeof DeploymentTriggers )[ keyof typeof DeploymentTriggers ];

export interface CatalogConfigEnvironmentMeta {
    environment: Environment;
    activeStripe: Stripe;
    deploymentTrigger: DeploymentTrigger;
    deployedStripes: Stripe[]
}
export interface PlatformEnvironment {
    environment: Environment;
    stripe: Stripe;
}
export interface ClusterMetadata {
    name: string;
    environments: PlatformEnvironment[]
    address: string
}

export interface PlatformSystem {
    name: string;
    systemGrub: string;
    containerGrub: string;
    domain: string;
    catalog: string;
    mainNamespace: string;
    environments: Environment[];
}

export type EnvironmentSet = 'gitops' | 'main-userspace' | 'data-ops'

export interface EnvironmentMapping {
    name: EnvironmentSet;
    environments: string[];
}

export type EnvironmentMap = EnvironmentMapping[];


export interface PlatformMetadata {
    systems: PlatformSystem[];
    clusters: ClusterMetadata[];
    environmentMap: EnvironmentMap
}

export interface PlatformMetadataResponse extends PlatformMetadata {}

export interface CatalogConfig {
    name: string;
    catalogName: string;
    mainNamespace: string;
    projectName: string;
    environments: CatalogConfigEnvironmentMeta[];
}

export interface BootstrapCatalogConfig {
    name: string;
    catalogName: string;
    argocdApplication: string;
    argocdProject: string;
}

export interface ApplicationSetSummary {
    name: string;
    applicationSet: ApplicationSet;
    generatorConfigs: {
        items: ApplicationSetConfigResult[]
    }
}

export interface DeploymentCatalogResponse {
    config: CatalogConfig;
    catalogApplicationSetSummaries: ApplicationSetSummary[];
}

export interface CatalogBootstrapResponse {
    config: BootstrapCatalogConfig,
    catalogApplications: ArgoApplication[]
}

export interface Manifest {
    apiVersion: string;
}

export interface PatchFile {
    path: string,
    patches: CatalogPatchItem[]
}

export interface WorkloadConfigurationDataPayload {
    catalogName: string;
    environment: Environment;
    stripe: Stripe;
    workloadName: string;
    catalogConfig: CatalogConfig;
    workloadEnvConfig: WorkloadEnvironmentConfig
    valuesSchema: any;
    values: WorkloadSchema;
    versions: ContainerVersionsList;
    valueFiles?: object[]; // We need to create an interface for all values Files
    applicationSet: ApplicationSet;
}

export interface WorkloadConfigurationDataUpdate extends WorkloadConfigurationDataPayload {
    updatedValues: WorkloadSchema;
}

export interface GenerateInstallationAuthorizedOctokitProps {
    appId: string;
    installationId: number;
    privateKey: string;
}

export interface GetFolderContentsResponse {
    name: string;
    path: string;
    type: "dir" | "file" | "submodule" | "symlink";
}

export const OctokitAuthTypes = {
    INSTALLATION: 'INSTALLATION',
    PAT: 'PAT'
} as const;

export type OctokitAuthType = (
    typeof OctokitAuthTypes
    )[ keyof typeof OctokitAuthTypes ];

export const HyperDeploymentDomains = {
    HYPER_PLATFORM: 'hyper-platform'
}

export type HyperDeploymentDomain = (
    typeof HyperDeploymentDomains
    )[ keyof typeof HyperDeploymentDomains ]

export const ProbeRoles =  {
    LIVENESS: 'liveness',
    READINESS: 'readiness'
}

export type ProbeRole = (
    typeof ProbeRoles
    )[ keyof typeof ProbeRoles ]

export interface EnvironmentVariableObj {
    name: string;
    value: string;
}

export interface SecretObj {
    name: string;
    secretKey: string;
    vaultPath: string;
}

export interface BasicContainerisedServiceSchema {
    serviceName?: string;
    namespace?: string;
    environment?: Environment;
    stripe?: Stripe
    serviceAccount?: string;
    revisionHistoryLimit?: number;
    container: {
        vault?: {
            key: string
        },
        secretStore?: {
            name: string;
        }
        replicas: number;
        image: {
            repository: string;
            tag: string;
        };
        containerPorts?: ContainerPortConfig[];
        resources: ContainerResourceProperties;
        secretRefreshInterval?: string;
        livenessProbe?: ContainerProbeProperties;
        readinessProbe?: ContainerProbeProperties;
        hpa?: ContainerHpaProperties;
        environment?: EnvironmentVariableObj[];
        secrets?: SecretObj[]
    };
}

export interface ContainerPortConfig {
    portName: string;
    portNumber: number;
    protocol: string;
    servicePort: number;
}

export interface ContainerVersionsList {
    name: string
    versions: {
        items: string[]
    }
}

export interface ContainerResourceProperties {
    requests: ResourceRequest;
    limits: ResourceRequest;
}

export interface ContainerProbeProperties {
    enabled?: boolean
    type: ProbeType;
    path: string;
    port: number;
    scheme: string;
    initialDelaySeconds: number;
    timeoutSeconds: number;
    periodSeconds: number;
    successThreshold: number;
    failureThreshold: number;
}

export const ProbeTypes = {
    HTTP: 'http',
    EXEC: 'exec'
}

export type ProbeType = (
    typeof ProbeTypes
    )[ keyof typeof ProbeTypes ]

export interface ContainerHpaProperties {
    enabled: boolean;
    targetCpu: number;
    minReplicas: number;
    maxReplicas: number;
}

export interface ResourceRequest {
    memory: string;
    cpu: string;
}

export interface ContainerStorageProperties {
    size: string;
    storageClass: string;
    mountPath: string;
    accessMode: string;
}

export interface ValuesFileStrategy< T = object > {
    generateValuesFile(variables: {
        serviceName: string;
        environment: string;
        stripe: string;
        containerPath: string;
        serviceCatalogName: string;
        namespace: string
    }): T;
}

export interface EnvironmentSecretDataProps {
    environment: Environment;
}

export const nonNullable = <T>( value: T ): value is NonNullable<T> => {
    return value != null;
}

export interface GitHubContent {
    [ key: string ]: any;
    sha?: string;
}

export interface GitHubFile {
    type: string;
    content: string;
    sha: string;
}

export interface GitHubTreeItem {
    path: string;
    mode: string;
    type: string;
    sha: string;
    size?: number;
    url: string;
}

export interface GitHubTree {
    sha: string;
    url: string;
    tree: GitHubTreeItem[];
    truncated: boolean;
}

export interface GitHubTreeResponse<T> {
    data: T;
    ok: boolean;
    errorType?: 'INVALID_RESPONSE' | 'NOT_FOUND' | 'NETWORK_ERROR';
    error?: string;
}

export const isSimpleApplicationSetConfig = (config: any): config is SimpleApplicationSetConfig => {
    return config
        && typeof config === 'object'
        && typeof config.targetCluster === 'string'
        && typeof config.env === 'string'
        && typeof config.stripe === 'string'
        && typeof config.projectName === 'string'
        && (config.namespace === undefined || typeof config.namespace === 'string');
}

export const isChartApplicationSetConfig = (config: any): config is ChartApplicationSetConfig => {
    return config
        && typeof config === 'object'
        && typeof config.targetCluster === 'string'
        && typeof config.env === 'string'
        && typeof config.stripe === 'string'
        && typeof config.projectName === 'string'
        && (config.namespace === undefined || typeof config.namespace === 'string')
        && typeof config.chartRepository === 'string'
        && typeof config.chartName === 'string'
        && typeof config.chartVersion === 'string'
        && typeof config.releaseName === 'string';
}


export type ApplicationSetConfigFileInfo = {
    path: string;
    workloadName: string;
    active: boolean;
};

export interface SimpleApplicationSetConfig {
    targetCluster: string;
    env: Environment;
    stripe: Stripe;
    projectName: string;
    namespace?: string;
}

export interface ChartApplicationSetConfig extends SimpleApplicationSetConfig {
    chartRepository: string;
    chartName: string;
    chartVersion: string;
    releaseName: string;
}

export type ApplicationSetConfigResult = {
    name: string;
    record: (SimpleApplicationSetConfig | ChartApplicationSetConfig) | null;
    active: boolean | null;
};

export const APPLICATION_SET_CONFIG_PATH_STRUCTURE = {
    CATALOG_INDEX: 0,
    WORKLOAD_INDEX: 1,
    CONFIG_INDEX: 2,
    ENV_INDEX: 3,
    STRIPE_INDEX: 4,
    FILENAME_INDEX: 5,
    EXPECTED_LENGTH: 6
} as const;

export interface HelmChartVersion {
    apiVersion: string;
    appVersion?: string;
    created: string;
    description: string;
    digest: string;
    name: string;
    urls: string[];
    version: string;
    // other fields can exist but are not needed for this function
}

export interface HelmRepositoryIndex {
    apiVersion: string;
    entries: Record<string, HelmChartVersion[]>;
    generated: string;
}

export const PlatformBaseCharts = {
    BASIC_CONTAINER_LOAD: 'BASIC_CONTAINER_LOAD',
    STATEFUL_CONTAINER_LOAD: 'STATEFUL_CONTAINER_LOAD'
} as const;

export type PlatformBaseChart = ( typeof PlatformBaseCharts )[ keyof typeof PlatformBaseCharts ];

export const KebabCaseToPlatformChartMap = Object.keys(PlatformBaseCharts).reduce(
    (acc, key) => {
        const value = PlatformBaseCharts[key as keyof typeof PlatformBaseCharts];

        const kebabCaseKey = kebabCase(key);

        acc[kebabCaseKey] = value;
        return acc;
    },
    {} as Record<string, PlatformBaseChart>, // The result is a strongly-typed record
);



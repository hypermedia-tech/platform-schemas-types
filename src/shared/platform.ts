import { kebabCase } from 'lodash';
import { Octokit } from '@octokit/rest';
import { WorkloadSchema } from "../workloadChartValues";
export interface AsyncOperationResponse<T> {
    ok: boolean;
    data: T | null;
    error?: string;
}

export interface YamlFileContent {
    path: string;
    content: GitHubContent | null;
    error?: string;
}

export interface GitHubResponse<T> extends AsyncOperationResponse<T>{
    errorType?: 'NOT_FOUND' | 'INVALID_YAML' | 'INVALID_RESPONSE' | 'NETWORK_ERROR' | 'AGGREGATE_FAILURE' | 'CLIENT_INITIALIZATION_FAILED' | 'PERMISSION_DENIED';
}
export type UpdateType = 'PUSH' | 'PULL_REQUEST';

export interface WorkloadConfigurationDataProps {
    environment: Environment;
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
    CORE: 'core',
    CORE_DEV: 'core-dev'
} as const;

export type Environment = ( typeof Environments )[ keyof typeof Environments ];


export const ORDERED_ENVIRONMENTS: Environment[] = [
    Environments.DEV,
    Environments.SYST,
    Environments.UAT
] as const;

export const ORDERED_CORE_ENVIRONMENTS: Environment[] = [
    Environments.CORE_DEV,
    Environments.CORE
] as const;

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
    workloadName: string;
}

export interface CatalogConfigRequestPathParams {
    catalogName: string;
}

export interface WorkloadConfigurationUpdateRequestPayload {
    catalogName: string;
    workloadName: string;
    environment: Environment;
    values: WorkloadSchema,
    updatedValues: WorkloadSchema
}

export interface WorkloadUpdateRequest {
    catalogName: string;
    environment: Environment;
    workloadName: string;
    updatedValues: any;
    sha: string;
    updateType: UpdateType;
    octokit: Octokit;
}

export interface WorkloadUpdateResponse {
    ok: boolean;
    data?: {
        sha?: string;
        pullRequestUrl?: string;
        pullRequestNumber?: number;
    };
    error?: string;
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
    releaseName?: string;
}

export interface Kustomization extends KustomizeConfigBaseType {
    kind: 'Kustomization'
}

export interface CatalogKustomization extends Kustomization {
    resources?: string[];
    helmGlobals?: {
        chartHome: string;
    }
    helmCharts?: KustomizationHelmChart[];
    commonAnnotations?: Record<string, string>;
}

export interface SourceCatalogKustomization extends CatalogKustomization {
    sha: string;
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
                labels: any;
                annotations: any;
            }
            spec: {
                project: string;
                source?: KustomizedApplicationSetSource
                sources?: ApplicationSetSource[];
                destination: {
                    name?: string
                    server?: string
                    namespace?: string
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

export interface KustomizedApplicationSetSource {
    repoURL: string;
    targetRevision: string;
    path: string;
    plugin: {
        name: string;
    }
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

export interface GeneratorExpression {
    key: string;
    operator: string;
    values: string[]
}
export interface ApplicationSetClustersGenerator {
    clusters: {
        selector?: {
            matchExpressions: GeneratorExpression[]
        }
    };
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
    deploymentTrigger: DeploymentTrigger;
}
export interface PlatformEnvironment {
    environment: Environment;
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

export const EnvironmentSets = {
    GITOPS: 'gitops',
    MAIN_USERSPACE: 'main-userspace',
    DATA_OPS: 'data-ops'
} as const;

export type EnvironmentSet =( typeof EnvironmentSets )[keyof typeof EnvironmentSets ]

export interface EnvironmentMapping {
    name: EnvironmentSet;
    environments: Environment[];
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

export interface AddonCatalogConfig {
    name: string;
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
        items: ApplicationSetConfigResult[];
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

export interface KubernetesResource {
    apiVersion: string;
    kind: string;
    metadata: {
        name: string;
        namespace?: string;
        [ key: string ]: any;
    };
    [ key: string ]: any;
}

export interface SourceKubernetesResource extends KubernetesResource {
    sha: string;
}

export interface PatchFile {
    path: string,
    patches: CatalogPatchItem[]
}

export interface WorkloadConfigurationDataPayload {
    catalogName: string;
    environment: Environment;
    workloadName: string;
    catalogConfig: CatalogConfig;
    valuesSchema: any;
    values: WorkloadSchema;
    versions: ContainerVersionsList;
    valueFiles?: object[]; // We need to create an interface for all values Files
    applicationSet: ApplicationSet;
    kustomization: CatalogKustomization;
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
    errorType?: 'INVALID_RESPONSE' | 'NOT_FOUND' | 'NETWORK_ERROR' | 'AGGREGATE_FAILURE' | 'CLIENT_INITIALIZATION_FAILED';
    error?: string;
}

export const isSimpleApplicationSetConfig = (config: any): config is SimpleApplicationSetConfig => {
    return config
        && typeof config === 'object'
        && typeof config.targetCluster === 'string'
        && typeof config.env === 'string'
}

export const isChartApplicationSetConfig = (config: any): config is ChartApplicationSetConfig => {
    return config
        && typeof config === 'object'
        && typeof config.targetCluster === 'string'
        && typeof config.env === 'string'
}


export type ApplicationSetConfigFileInfo = {
    path: string;
    workloadName: string;
    active: boolean;
};

export interface SimpleApplicationSetConfig {
    targetCluster: string;
    env: Environment;
}

export interface ChartApplicationSetConfig extends SimpleApplicationSetConfig {}

export type ApplicationSetConfigResult = {
    name: string;
    record: (SimpleApplicationSetConfig | ChartApplicationSetConfig) | null;
    active: boolean | null;
    kustomization?: SourceCatalogKustomization
};

export const APPLICATION_SET_CONFIG_PATH_STRUCTURE = {
    CATALOG_INDEX: 0,
    WORKLOAD_INDEX: 1,
    CONFIG_INDEX: 2,
    ENV_INDEX: 3,
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
    BASIC_CONTAINER_ROLLOUT: "BASIC_CONTAINER_ROLLOUT",
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

interface AnalysisTemplateConfig {
    enabled: boolean;
    initialDelay: string;
    duration: string;
    successRate: number;
    maxP95Latency: number;
    maxErrorRate: number;
}

interface AnalysisConfig {
    successfulRunHistoryLimit?: number;
    unsuccessfulRunHistoryLimit?: number;
}

export interface SetWeightStep {
    setWeight: number;
}

export interface PauseStep {
    pause: {
        duration?: string;
    } | {}; // empty object for manual approval
}

export interface AnalysisStep {
    analysis: {
        templates: Array<{
            templateName: string;
        }>;
    };
}

export type RolloutStep = SetWeightStep | PauseStep | AnalysisStep;

interface CanaryStrategy {
    maxSurge: number;
    maxUnavailable: number;
    scaleDownDelaySeconds?: number;
    steps: RolloutStep[];
}

interface RolloutStrategy {
    canary: CanaryStrategy;
}

export interface RolloutConfig {
    analysis: AnalysisConfig;
    analysisTemplate: AnalysisTemplateConfig;
    strategy: RolloutStrategy;
    progressDeadlineSeconds?: number;
}

export interface ApiResponse<T> {
    statusCode: number;
    item?: T;
    message?: string;
}

export interface ApiCollectionResponse<T> {
    statusCode: number;
    items: T[];
    message?: string;
}

export const InboundGitHubEventTypes = {
    EVENT_REPO_PUSH: 'push',
    EVENT_REPOSITORY: 'repository',
    EVENT_TEST_COMPLETE: 'test_complete',
    EVENT_REGISTRY_PACKAGE: 'registry_package'
} as const;

export type InboundGitHubEventType = ( typeof InboundGitHubEventTypes )[ keyof typeof InboundGitHubEventTypes ];

export const InternalEventTypes = {
    REPO_PUSHED: 'repo-pushed',
    REPOSITORY_EVENT: 'repository',
    TEST_COMPLETED: 'test-completed',
    PACKAGE_PUBLISHED: 'package-published',
    ENVIRONMENT_UPDATED: 'environment-updated',
    PR_OPENED: 'pr-opened',
    PR_CLOSED: "pr-closed"
} as const;

export type InternalEventType = ( typeof InternalEventTypes )[ keyof typeof InternalEventTypes ];

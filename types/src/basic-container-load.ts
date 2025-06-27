/**
 * Generated types for basic-container-load Helm chart
 * DO NOT EDIT - This file is auto-generated from values.schema.json
 */

export interface Values {
  workloadType?: 'BASIC_CONTAINER_LOAD';
  basicMonitoring?: {
    enabled?: boolean;
  };
  serviceCatalog?: string;
  container?: {
    containerPorts?: {
      portName?: string;
      portNumber?: number;
      protocol?: string;
      servicePort?: number;
    }[];
    environment?: unknown[];
    hpa?: {
      enabled?: boolean;
      maxReplicas?: number;
      minReplicas?: number;
      targetCpu?: number;
    };
    image?: {
      repository?: string;
      tag?: string;
    };
    livenessProbe?: {
      enabled?: boolean;
      failureThreshold?: number;
      initialDelaySeconds?: number;
      path?: string;
      periodSeconds?: number;
      port?: number;
      scheme?: string;
      successThreshold?: number;
      timeoutSeconds?: number;
      type?: string;
    };
    readinessProbe?: {
      enabled?: boolean;
      failureThreshold?: number;
      initialDelaySeconds?: number;
      path?: string;
      periodSeconds?: number;
      port?: number;
      scheme?: string;
      successThreshold?: number;
      timeoutSeconds?: number;
      type?: string;
    };
    replicas?: number;
    resources?: {
      limits?: {
        cpu?: string;
        memory?: string;
      };
      requests?: {
        cpu?: string;
        memory?: string;
      };
    };
    secretRefreshInterval?: string;
    secretStore?: {
      name?: string;
    };
    secrets?: unknown[];
    vault?: {
      key?: string;
      server?: string;
      role?: string;
    };
  };
  environment?: string;
  ingress?: {
    enabled?: boolean;
    host?: string;
  };
  key?: string;
  nameOverride?: string;
  namespace?: string;
  revisionHistoryLimit?: number;
  service?: {
    port?: number;
  };
  serviceAccount?: string;
  serviceName?: string;
  stripe?: string;
}

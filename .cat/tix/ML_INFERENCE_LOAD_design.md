# ML_INFERENCE_LOAD Design Document

## Overview

This document describes the technical design for the `ML_INFERENCE_LOAD` workload type - a Helm chart for deploying ML inference services using Hugging Face Text Generation Inference (TGI).

---

## 1. What is TGI?

Text Generation Inference (TGI) is Hugging Face's production-ready inference server for LLMs. It:

- Downloads models from Hugging Face Hub on startup
- Serves them via HTTP REST API
- Handles batching, streaming, and token generation
- Exposes health and metrics endpoints

**Container image:** `ghcr.io/huggingface/text-generation-inference`

**Key endpoints:**
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/generate` | POST | Single completion |
| `/generate_stream` | POST | Streaming completion |
| `/health` | GET | Health check |
| `/info` | GET | Model info |
| `/metrics` | GET | Prometheus metrics |

---

## 2. Kubernetes Manifests

Following the existing chart patterns, we generate 5 manifests:

### 2.1 Deployment

The core workload. Key differences from `BASIC_CONTAINER_LOAD`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Values.serviceName }}
  namespace: {{ .Values.namespace }}
  labels:
    app: {{ .Values.serviceName }}
spec:
  replicas: 1  # Fixed for v1 POC
  selector:
    matchLabels:
      app: {{ .Values.serviceName }}
  template:
    metadata:
      annotations:
        {{- if .Values.basicMonitoring.enabled }}
        prometheus.io/scrape: "true"
        prometheus.io/port: "8080"
        prometheus.io/path: /metrics
        {{- end }}
      labels:
        app: {{ .Values.serviceName }}
        catalog: {{ .Values.serviceCatalog }}
    spec:
      # GPU scheduling
      runtimeClassName: nvidia
      nodeSelector:
        nvidia.com/gpu.present: "true"

      # Optional image pull secret
      {{- if .Values.imagePullSecret.enabled }}
      imagePullSecrets:
        - name: {{ .Values.serviceName }}-ghcr-docker-config
      {{- end }}

      containers:
        - name: {{ .Values.serviceName }}
          image: {{ .Values.inference.image.repository }}:{{ .Values.inference.image.tag }}
          imagePullPolicy: Always
          ports:
            - name: http
              containerPort: 8080

          env:
            # Model configuration
            - name: MODEL_ID
              value: {{ .Values.model.id | quote }}
            - name: REVISION
              value: {{ .Values.model.revision | quote }}
            {{- if .Values.inference.maxInputLength }}
            - name: MAX_INPUT_LENGTH
              value: {{ .Values.inference.maxInputLength | quote }}
            {{- end }}
            {{- if .Values.inference.maxTotalTokens }}
            - name: MAX_TOTAL_TOKENS
              value: {{ .Values.inference.maxTotalTokens | quote }}
            {{- end }}
            # User-provided env vars (including secrets from Vault)
            {{- range .Values.environment }}
            - name: {{ .name }}
              value: {{ .value | quote }}
            {{- end }}
            {{- range .Values.secrets }}
            - name: {{ .name }}
              valueFrom:
                secretKeyRef:
                  name: {{ $.Values.serviceName }}-secrets
                  key: {{ .secretKey }}
            {{- end }}

          resources:
            requests:
              cpu: {{ .Values.resources.requests.cpu | quote }}
              memory: {{ .Values.resources.requests.memory | quote }}
            limits:
              cpu: {{ .Values.resources.limits.cpu | quote }}
              memory: {{ .Values.resources.limits.memory | quote }}
              nvidia.com/gpu: {{ .Values.gpu.count }}

          livenessProbe:
            httpGet:
              path: /health
              port: 8080
            initialDelaySeconds: {{ .Values.healthCheck.initialDelaySeconds }}
            periodSeconds: {{ .Values.healthCheck.periodSeconds }}
            timeoutSeconds: {{ .Values.healthCheck.timeoutSeconds }}
            failureThreshold: {{ .Values.healthCheck.failureThreshold }}

          readinessProbe:
            httpGet:
              path: /health
              port: 8080
            initialDelaySeconds: {{ .Values.healthCheck.initialDelaySeconds }}
            periodSeconds: {{ .Values.healthCheck.periodSeconds }}
            timeoutSeconds: {{ .Values.healthCheck.timeoutSeconds }}
            failureThreshold: {{ .Values.healthCheck.failureThreshold }}
```

**Why `runtimeClassName: nvidia`?**
The NVIDIA GPU Operator installs a container runtime that handles GPU device mounting. Without this, containers can't access GPUs.

**Why long `initialDelaySeconds`?**
TGI downloads and loads the model on startup. For a 1B parameter model, this can take 1-3 minutes. Larger models take longer.

### 2.2 Service

Standard ClusterIP service (matches existing pattern):

```yaml
apiVersion: v1
kind: Service
metadata:
  name: {{ .Values.serviceName }}
  namespace: {{ .Values.namespace }}
spec:
  selector:
    app: {{ .Values.serviceName }}
  ports:
    - name: http
      port: {{ .Values.service.port | default 80 }}
      targetPort: 8080
      protocol: TCP
```

### 2.3 Gateway

Per-service gateway for TLS termination (matches existing pattern):

```yaml
{{- if .Values.ingress.enabled }}
apiVersion: gateway.networking.k8s.io/v1beta1
kind: Gateway
metadata:
  name: {{ .Values.serviceName }}-gateway
  namespace: {{ .Release.Namespace }}
spec:
  gatewayClassName: istio
  listeners:
    - name: https
      port: 443
      protocol: HTTPS
      hostname: {{ .Values.ingress.host | quote }}
      tls:
        mode: Terminate
        certificateRefs:
          - name: {{ .Values.serviceName }}-tls-cert
            kind: Secret
            namespace: {{ .Release.Namespace }}
{{- end }}
```

### 2.4 HTTPRoute

Routes traffic to the service (matches existing pattern):

```yaml
{{- if .Values.ingress.enabled }}
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: {{ .Values.serviceName }}-http-route
  namespace: {{ .Release.Namespace }}
spec:
  hostnames:
    - {{ .Values.ingress.host | quote }}
  parentRefs:
    - name: {{ .Values.serviceName }}-gateway
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /
      backendRefs:
        - name: {{ .Values.serviceName }}
          port: {{ .Values.service.port | default 80 }}
{{- end }}
```

### 2.5 ExternalSecret

Pulls secrets from Vault (matches existing `secrets` array pattern):

```yaml
{{- if .Values.secrets }}
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: {{ .Values.serviceName }}-secrets
  namespace: {{ .Values.namespace }}
spec:
  refreshInterval: {{ .Values.secretRefreshInterval | default "1h" }}
  secretStoreRef:
    name: {{ .Values.secretStore.name }}
    kind: ClusterSecretStore
  target:
    name: {{ .Values.serviceName }}-secrets
    creationPolicy: Owner
  data:
    {{- range .Values.secrets }}
    - secretKey: {{ .secretKey }}
      remoteRef:
        key: {{ .vaultPath }}
        property: value
    {{- end }}
{{- end }}
```

---

## 3. Values Schema

Aligned with existing chart patterns:

```yaml
# Required - identifies workload type
workloadType: 'ML_INFERENCE_LOAD'

# Service identity (matches existing patterns)
serviceName: 'my-llm-service'
serviceCatalog: 'ml-team'
namespace: 'ml-inference'
environment: 'prod'
serviceAccount: ''  # Optional

# Revision history (matches existing pattern)
revisionHistoryLimit: 2

# Ingress (matches existing pattern)
ingress:
  enabled: true
  host: 'llm.example.com'

# Service port (matches existing pattern)
service:
  port: 80

# Model configuration (NEW - ML specific)
model:
  id: 'meta-llama/Llama-3.2-1B'   # Required - HF model ID
  revision: 'main'                 # Required - like image.tag

# Inference server configuration (NEW - ML specific)
inference:
  image:
    repository: 'ghcr.io/huggingface/text-generation-inference'
    tag: '2.4.0'
  maxInputLength: 2048    # Optional
  maxTotalTokens: 4096    # Optional

# GPU configuration (NEW - ML specific)
gpu:
  count: 1

# Resources (matches existing pattern, GPU added to limits)
resources:
  requests:
    cpu: '2'
    memory: '8Gi'
  limits:
    cpu: '4'
    memory: '16Gi'

# Health checks (simplified - TGI has fixed endpoints)
healthCheck:
  initialDelaySeconds: 120  # Models take time to load
  periodSeconds: 30
  timeoutSeconds: 10
  failureThreshold: 3

# Monitoring (matches existing pattern)
basicMonitoring:
  enabled: true

# Vault connection (matches existing pattern)
vault:
  key: 'path_to_secret'
  server: 'http://vault.vault.svc.cluster.local:8200'
  role: 'external-secrets-role'

# Secret store (matches existing pattern)
secretStore:
  name: 'vault-backend'

# Secrets from Vault (matches existing pattern)
# HF token goes here, not in a separate field
secrets:
  - name: HUGGING_FACE_HUB_TOKEN
    secretKey: hf-token
    vaultPath: /secret/shared/huggingface/token

# Secret refresh interval (matches existing pattern)
secretRefreshInterval: '1h'

# Environment variables (matches existing pattern)
# Quantization can be added here if needed
environment: []
# Example for quantization:
# environment:
#   - name: QUANTIZE
#     value: bitsandbytes

# Image pull secret (optional - for future private registry)
imagePullSecret:
  enabled: false
```

---

## 4. TypeScript Interface

```typescript
// /src/workloadChartValues/mlInferenceLoad.ts

import {
    Environment,
    EnvironmentVariableObj,
    SecretObj
} from "../shared";

export interface MlInferenceLoadSchema {
    workloadType: "ML_INFERENCE_LOAD";
    serviceName: string;
    serviceCatalog: string;
    namespace?: string;
    environment: Environment;
    serviceAccount?: string;
    revisionHistoryLimit?: number;

    ingress?: {
        enabled: boolean;
        host: string;
    };

    service?: {
        port?: number;
    };

    model: {
        id: string;       // HF model ID e.g. "meta-llama/Llama-3.2-1B"
        revision: string; // Model version e.g. "main" or commit SHA
    };

    inference: {
        image: {
            repository: string;
            tag: string;
        };
        maxInputLength?: number;
        maxTotalTokens?: number;
    };

    gpu: {
        count: number;
    };

    resources: {
        requests: {
            cpu: string;
            memory: string;
        };
        limits: {
            cpu: string;
            memory: string;
        };
    };

    healthCheck?: {
        initialDelaySeconds?: number;
        periodSeconds?: number;
        timeoutSeconds?: number;
        failureThreshold?: number;
    };

    basicMonitoring?: {
        enabled: boolean;
    };

    vault?: {
        key: string;
    };

    secretStore?: {
        name: string;
    };

    secrets?: SecretObj[];
    secretRefreshInterval?: string;
    environment?: EnvironmentVariableObj[];

    imagePullSecret?: {
        enabled: boolean;
    };

    nameOverride?: string;
}
```

---

## 5. TGI Environment Variables

The chart translates values to TGI env vars:

| Values Path | Env Var | Required | Description |
|-------------|---------|----------|-------------|
| `model.id` | `MODEL_ID` | Yes | Hugging Face model identifier |
| `model.revision` | `REVISION` | Yes | Model version/commit |
| `inference.maxInputLength` | `MAX_INPUT_LENGTH` | No | Max input tokens |
| `inference.maxTotalTokens` | `MAX_TOTAL_TOKENS` | No | Max total tokens |
| `secrets[].name=HUGGING_FACE_HUB_TOKEN` | `HUGGING_FACE_HUB_TOKEN` | Yes* | Auth token for gated models |
| `environment[].name=QUANTIZE` | `QUANTIZE` | No | Quantization method |

*Required for gated/private models like Llama.

---

## 6. Comparison with BASIC_CONTAINER_LOAD

| Aspect | BASIC_CONTAINER_LOAD | ML_INFERENCE_LOAD |
|--------|---------------------|-------------------|
| K8s Primitive | Deployment | Deployment |
| Replicas | Configurable + HPA | Fixed at 1 (v1) |
| Runtime | Default | `nvidia` |
| Node Selection | None | GPU nodes |
| Resources | CPU/Memory only | CPU/Memory + GPU |
| Probes | Configurable path/port | Fixed to `/health:8080` |
| Probe Delay | 10s default | 120s default |
| Secrets | `secrets` array | `secrets` array (same) |
| Gateway | Per-service | Per-service (same) |
| Monitoring | Annotations | Annotations (same) |

---

## 7. File Structure

```
/charts/ml-inference-load/
├── Chart.yaml
├── values.yaml
├── values.schema.json
└── templates/
    ├── deployment.yaml
    ├── service.yaml
    ├── gateway.yaml
    ├── httproute.yaml
    ├── external-secret.yaml
    └── ghcr.external-secret.yaml  # Optional, for private registry

/src/workloadChartValues/
├── mlInferenceLoad.ts              # New file
└── workloadSchema.ts               # Updated union type

/.cat/backstage/
└── ml-inference-load.yaml          # New catalog entry
```

---

## 8. Example Catalog Entry

A complete values file for a catalog entry:

```yaml
workloadType: 'ML_INFERENCE_LOAD'
serviceName: 'llama-inference'
serviceCatalog: 'ml-platform'
namespace: 'ml-inference'
environment: 'prod'

ingress:
  enabled: true
  host: 'llama.hypermedia.au'

model:
  id: 'meta-llama/Llama-3.2-1B'
  revision: 'main'

inference:
  image:
    repository: 'ghcr.io/huggingface/text-generation-inference'
    tag: '2.4.0'
  maxInputLength: 2048
  maxTotalTokens: 4096

gpu:
  count: 1

resources:
  requests:
    cpu: '2'
    memory: '8Gi'
  limits:
    cpu: '4'
    memory: '16Gi'

healthCheck:
  initialDelaySeconds: 180
  periodSeconds: 30
  timeoutSeconds: 10
  failureThreshold: 3

basicMonitoring:
  enabled: true

secretStore:
  name: 'vault-backend'

secrets:
  - name: HUGGING_FACE_HUB_TOKEN
    secretKey: hf-token
    vaultPath: /secret/shared/huggingface/token

environment: []

imagePullSecret:
  enabled: false
```

---

## 9. Future Enhancements (Out of Scope for v1)

### 9.1 Model Caching (PVC)

Add PVC to cache downloaded models:

```yaml
storage:
  modelCache:
    enabled: true
    size: '50Gi'
    storageClass: 'nfs'
    mountPath: '/data'
```

This would:
- Create a PVC
- Mount it at `/data`
- Set `HUGGINGFACE_HUB_CACHE=/data` env var
- Survive pod restarts without re-downloading

### 9.2 Dedicated Quantization Field

If quantization becomes commonly used:

```yaml
model:
  id: 'meta-llama/Llama-3.2-1B'
  revision: 'main'
  quantization: 'bitsandbytes'  # New field
```

### 9.3 HPA Support

For high-traffic inference:

```yaml
hpa:
  enabled: true
  minReplicas: 1
  maxReplicas: 3
  targetCpu: 80
```

---

## 10. Testing Plan

1. **Helm lint** - Validate chart syntax
2. **Helm template** - Verify generated manifests
3. **Deploy to dev** - Single GPU test environment
4. **Verify model loading** - Check logs for successful model load
5. **Test inference** - `curl POST /generate`
6. **Test health endpoint** - Verify probes work
7. **Test ingress** - External access via Gateway + HTTPRoute

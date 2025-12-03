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

## 2. Kubernetes Manifests (v1)

### 2.1 Deployment

The core workload. Key differences from `BASIC_CONTAINER_LOAD`:

```yaml
apiVersion: apps/v1
kind: Deployment
spec:
  replicas: 1  # Fixed for v1 POC
  template:
    spec:
      # GPU scheduling
      runtimeClassName: nvidia
      nodeSelector:
        nvidia.com/gpu.present: "true"

      containers:
        - name: inference
          image: ghcr.io/huggingface/text-generation-inference:2.4.0

          # TGI configuration via env vars
          env:
            - name: MODEL_ID
              value: "meta-llama/Llama-3.2-1B"
            - name: HUGGING_FACE_HUB_TOKEN
              valueFrom:
                secretKeyRef:
                  name: {{ serviceName }}-hf-token
                  key: token

          # GPU resource request
          resources:
            limits:
              nvidia.com/gpu: 1
            requests:
              cpu: "2"
              memory: "8Gi"

          # Health probes (TGI-specific)
          livenessProbe:
            httpGet:
              path: /health
              port: 8080
            initialDelaySeconds: 120  # Models take time to load
          readinessProbe:
            httpGet:
              path: /health
              port: 8080
            initialDelaySeconds: 120
```

**Why `runtimeClassName: nvidia`?**
The NVIDIA GPU Operator installs a container runtime that handles GPU device mounting. Without this, containers can't access GPUs.

**Why long `initialDelaySeconds`?**
TGI downloads and loads the model on startup. For a 1B parameter model, this can take 1-3 minutes. Larger models take longer.

### 2.2 Service

Standard ClusterIP service:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: {{ serviceName }}
spec:
  selector:
    app: {{ serviceName }}
  ports:
    - port: 80
      targetPort: 8080
```

### 2.3 HTTPRoute

Exposes the service externally via Gateway API (Ambient Istio):

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: {{ serviceName }}-http-route
spec:
  hostnames:
    - {{ ingress.host }}
  parentRefs:
    - name: ???  # QUESTION: What gateway in Ambient Istio?
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /
      backendRefs:
        - name: {{ serviceName }}
          port: 80
```

### 2.4 ExternalSecret

Pulls HF token from Vault:

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: {{ serviceName }}-hf-token
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend
    kind: ClusterSecretStore
  target:
    name: {{ serviceName }}-hf-token
  data:
    - secretKey: token
      remoteRef:
        key: {{ vault.hfTokenPath }}
        property: value
```

---

## 3. Values Schema (Proposed)

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

# Ingress (matches existing pattern)
ingress:
  enabled: true
  host: 'llm.example.com'

# Model configuration (NEW - ML specific)
model:
  id: 'meta-llama/Llama-3.2-1B'   # HF model ID - REQUIRED
  revision: 'main'                 # Model version - REQUIRED (like image.tag)

# Inference server configuration (NEW - ML specific)
inference:
  image:
    repository: 'ghcr.io/huggingface/text-generation-inference'
    tag: '2.4.0'
  maxInputLength: 2048
  maxTotalTokens: 4096
  port: 8080

# GPU configuration (NEW - ML specific)
gpu:
  count: 1
  nodeSelector:
    nvidia.com/gpu.present: 'true'

# Vault configuration (matches existing pattern)
vault:
  hfTokenPath: '/secret/shared/huggingface/token'

# Secret store (matches existing pattern)
secretStore:
  name: 'vault-backend'

# Resources (matches existing pattern, but with GPU)
resources:
  requests:
    cpu: '2'
    memory: '8Gi'
  limits:
    cpu: '4'
    memory: '16Gi'
    # Note: nvidia.com/gpu injected from gpu.count

# Health checks (simplified - TGI has fixed endpoints)
healthCheck:
  initialDelaySeconds: 120
  periodSeconds: 30
  timeoutSeconds: 10
  failureThreshold: 3

# Monitoring (matches existing pattern)
basicMonitoring:
  enabled: true

# Environment variables (matches existing pattern)
environment: []
```

---

## 4. TypeScript Interface

```typescript
// /src/workloadChartValues/mlInferenceLoad.ts

import {
    Environment,
    EnvironmentVariableObj
} from "../shared";

export interface MlInferenceLoadSchema {
    workloadType: "ML_INFERENCE_LOAD";
    serviceName: string;
    serviceCatalog: string;
    namespace?: string;
    environment: Environment;
    serviceAccount?: string;

    ingress?: {
        enabled: boolean;
        host: string;
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
        port?: number;
    };

    gpu: {
        count: number;
        nodeSelector?: Record<string, string>;
    };

    vault: {
        hfTokenPath: string;
    };

    secretStore?: {
        name: string;
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

    environment?: EnvironmentVariableObj[];
}
```

---

## 5. TGI Environment Variables

The chart will translate values to TGI env vars:

| Values Path | Env Var | Description |
|-------------|---------|-------------|
| `model.id` | `MODEL_ID` | Hugging Face model identifier |
| `model.revision` | `REVISION` | Model version/commit |
| `inference.maxInputLength` | `MAX_INPUT_LENGTH` | Max input tokens |
| `inference.maxTotalTokens` | `MAX_TOTAL_TOKENS` | Max total tokens (input + output) |
| Secret | `HUGGING_FACE_HUB_TOKEN` | Auth token for private/gated models |

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
| Secrets | Generic vault paths | HF token specific |
| Storage | None | None (v1), PVC (future) |

---

## 7. File Structure

```
/charts/ml-inference-load/
  Chart.yaml
  values.yaml
  values.schema.json
  templates/
    deployment.yaml
    service.yaml
    httproute.yaml
    external-secret.yaml

/src/workloadChartValues/
  mlInferenceLoad.ts        # New file
  workloadSchema.ts         # Updated to include union

/.cat/backstage/
  ml-inference-load.yaml    # New catalog entry
```

---

## 8. Future Enhancements (Out of Scope for v1)

### 8.1 Model Caching (PVC)

Add PVC to cache downloaded models:

```yaml
storage:
  modelCache:
    enabled: true
    size: '50Gi'
    storageClass: 'nfs'  # Your NFS storage class
    mountPath: '/data'
```

This would:
- Create a PVC
- Mount it at `/data`
- Set `HUGGINGFACE_HUB_CACHE=/data` env var
- Survive pod restarts without re-downloading

### 8.2 Multiple GPUs

For larger models requiring multiple GPUs:

```yaml
gpu:
  count: 4
```

TGI automatically shards models across available GPUs.

### 8.3 Quantization

For running larger models on fewer GPUs:

```yaml
model:
  quantization: 'bitsandbytes'  # or gptq, awq, eetq
```

Sets `QUANTIZE` env var.

### 8.4 ServiceMonitor

If using Prometheus Operator:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: {{ serviceName }}-monitor
spec:
  selector:
    matchLabels:
      app: {{ serviceName }}
  endpoints:
    - port: http
      path: /metrics
      interval: 30s
```

---

## 9. Testing Plan

1. **Helm lint** - Validate chart syntax
2. **Helm template** - Verify generated manifests
3. **Deploy to dev** - Single GPU test environment
4. **Verify model loading** - Check logs for successful model load
5. **Test inference** - `curl POST /generate`
6. **Test health endpoint** - Verify probes work
7. **Test ingress** - External access via HTTPRoute

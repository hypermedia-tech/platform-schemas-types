# ML_INFERENCE_LOAD Design Document

## Overview

This document describes the technical design for the `ML_INFERENCE_LOAD` workload type - a Helm chart for deploying ML inference services using Hugging Face Text Generation Inference (TGI).

This chart is intentionally **minimal** - a leaner version of the existing charts, removing unused patterns and adding only what's needed for GPU workloads.

---

## 1. What is TGI?

Text Generation Inference (TGI) is Hugging Face's production-ready inference server for LLMs. It:

- Downloads models from Hugging Face Hub on startup
- Serves them via HTTP REST API
- Handles batching, streaming, and token generation
- Exposes health and metrics endpoints

**Container image:** `ghcr.io/huggingface/text-generation-inference` (public, no pull secret needed)

**Key endpoints:**
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/generate` | POST | Single completion |
| `/generate_stream` | POST | Streaming completion |
| `/health` | GET | Health check |
| `/info` | GET | Model info |
| `/metrics` | GET | Prometheus metrics |

---

## 2. Simplifications from Existing Charts

| Removed | Reason |
|---------|--------|
| `container.vault.*` | Not used in any existing template (dead config) |
| GHCR ExternalSecret | TGI image is public |
| ServiceAccount | Appears orphaned in existing charts |
| NodePort | ClusterIP sufficient; Gateway handles external access |
| Monitoring annotations | Add later when we understand what we need |
| `imagePullSecrets` | No private registry for TGI |

---

## 3. Kubernetes Manifests

**6 templates** (vs 8 in existing charts):

### 3.1 Deployment

```yaml
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Values.serviceName }}
  namespace: {{ .Values.namespace }}
  labels:
    app: {{ .Values.serviceName }}
    version: {{ .Values.container.image.tag | quote }}
spec:
  replicas: {{ .Values.container.replicas }}
  revisionHistoryLimit: {{ .Values.revisionHistoryLimit | default 2 }}
  selector:
    matchLabels:
      app: {{ .Values.serviceName }}
  template:
    metadata:
      labels:
        app: {{ .Values.serviceName }}
        version: {{ .Values.container.image.tag | quote }}
        catalog: {{ .Values.serviceCatalog }}
    spec:
      # GPU-SPECIFIC
      runtimeClassName: nvidia
      nodeSelector:
        nvidia.com/gpu.present: "true"
      {{- if .Values.serviceAccount }}
      serviceAccountName: {{ .Values.serviceAccount }}
      {{- end }}
      containers:
        - name: {{ .Values.serviceName }}
          image: {{ .Values.container.image.repository }}:{{ .Values.container.image.tag }}
          imagePullPolicy: Always
          ports:
           {{- range .Values.container.containerPorts }}
            - name: {{ .portName }}
              containerPort: {{ .portNumber }}
           {{- end }}
          {{- if .Values.container.livenessProbe.enabled }}
          livenessProbe:
            {{- with .Values.container.livenessProbe }}
            {{- if eq .type "http" }}
            httpGet:
              path: {{ .path }}
              port: {{ .port }}
              scheme: {{ .scheme }}
            {{- end }}
            initialDelaySeconds: {{ .initialDelaySeconds }}
            periodSeconds: {{ .periodSeconds }}
            successThreshold: {{ .successThreshold }}
            failureThreshold: {{ .failureThreshold }}
            {{- end }}
          {{- end }}
          {{- if .Values.container.readinessProbe.enabled }}
          readinessProbe:
            {{- with .Values.container.readinessProbe }}
            {{- if eq .type "http" }}
            httpGet:
              path: {{ .path }}
              port: {{ .port }}
              scheme: {{ .scheme }}
            {{- end }}
            initialDelaySeconds: {{ .initialDelaySeconds }}
            periodSeconds: {{ .periodSeconds }}
            successThreshold: {{ .successThreshold }}
            failureThreshold: {{ .failureThreshold }}
            {{- end }}
          {{- end }}
          resources:
            requests:
              cpu: {{ .Values.container.resources.requests.cpu | quote }}
              memory: {{ .Values.container.resources.requests.memory | quote }}
            limits:
              cpu: {{ .Values.container.resources.limits.cpu | quote }}
              memory: {{ .Values.container.resources.limits.memory | quote }}
              nvidia.com/gpu: {{ .Values.gpu.count }}
          env:
            # ML-SPECIFIC: Model configuration
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
            {{- if .Values.container.environment }}
            {{- range .Values.container.environment }}
            - name: {{ .name }}
              value: {{ .value | quote }}
            {{- end }}
            {{- end }}
            {{- if .Values.container.secrets }}
            {{- range .Values.container.secrets }}
            - name: {{ .name }}
              valueFrom:
                secretKeyRef:
                  name: {{ $.Values.serviceName }}-secrets
                  key: {{ .secretKey }}
            {{- end }}
            {{- end }}
```

### 3.2 Service

```yaml
---
apiVersion: v1
kind: Service
metadata:
  name: {{ .Values.serviceName }}
  namespace: {{ .Values.namespace }}
  labels:
    app: {{ .Values.serviceName }}
    catalog: {{ .Values.serviceCatalog }}
spec:
  ports:
    {{- range .Values.container.containerPorts }}
    - name: {{ .portName }}
      protocol: {{ .protocol }}
      port: {{ .servicePort }}
      targetPort: {{ .portNumber }}
    {{- end }}
  type: ClusterIP
  selector:
    app: {{ .Values.serviceName }}
```

### 3.3 Gateway

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

### 3.4 HTTPRoute

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

### 3.5 Certificate

```yaml
{{- if .Values.ingress.enabled }}
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: {{ .Values.serviceName }}-tls-cert
  namespace: {{ .Release.Namespace }}
spec:
  secretName: {{ .Values.serviceName }}-tls-cert
  commonName: {{ .Values.ingress.host }}
  dnsNames:
    - {{ .Values.ingress.host }}
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
{{- end }}
```

### 3.6 ExternalSecret (Service Secrets)

```yaml
{{- if .Values.container.secrets }}
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: {{ .Values.serviceName }}-secrets
  namespace: {{ .Values.namespace }}
spec:
  refreshInterval: {{ .Values.container.secretRefreshInterval | default "1h" }}
  secretStoreRef:
    name: {{ .Values.container.secretStore.name }}
    kind: ClusterSecretStore
  target:
    name: {{ .Values.serviceName }}-secrets
    creationPolicy: Owner
  data:
    {{- range .Values.container.secrets }}
    - secretKey: {{ .secretKey }}
      remoteRef:
        key: {{ .vaultPath }}
        property: value
    {{- end }}
{{- end }}
```

---

## 4. Values Schema

```yaml
workloadType: ML_INFERENCE_LOAD
serviceName: &svcName my-llm-service
nameOverride: *svcName
serviceCatalog: ml-team
namespace: ml-inference
environment: prod
serviceAccount: ""
revisionHistoryLimit: 2

ingress:
  enabled: true
  host: "llm.example.com"

service:
  port: 80

# ML-SPECIFIC: Model configuration
model:
  id: "meta-llama/Llama-3.2-1B"   # Required
  revision: "main"                 # Required

# ML-SPECIFIC: Inference settings
inference:
  maxInputLength: 2048    # Optional
  maxTotalTokens: 4096    # Optional

# ML-SPECIFIC: GPU configuration
gpu:
  count: 1

# Container config
container:
  secretStore:
    name: vault-backend
  replicas: 1
  image:
    repository: ghcr.io/huggingface/text-generation-inference
    tag: "2.4.0"
  containerPorts:
    - portName: "http"
      portNumber: 8080
      protocol: "TCP"
      servicePort: 80
  resources:
    requests:
      cpu: "2"
      memory: "8Gi"
    limits:
      cpu: "4"
      memory: "16Gi"
  secretRefreshInterval: 1h
  livenessProbe:
    enabled: true
    type: "http"
    path: "/health"
    port: 8080
    scheme: "HTTP"
    initialDelaySeconds: 120
    timeoutSeconds: 10
    periodSeconds: 30
    successThreshold: 1
    failureThreshold: 3
  readinessProbe:
    enabled: true
    type: "http"
    path: "/health"
    port: 8080
    scheme: "HTTP"
    initialDelaySeconds: 120
    timeoutSeconds: 10
    periodSeconds: 30
    successThreshold: 1
    failureThreshold: 3
  environment: []
  secrets:
    - name: HUGGING_FACE_HUB_TOKEN
      secretKey: hf-token
      vaultPath: /secret/shared/huggingface/token
```

---

## 5. TypeScript Interface

```typescript
// /src/workloadChartValues/mlInferenceLoad.ts

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
```

---

## 6. Differences from Existing Charts

| Aspect | Existing Charts | ML_INFERENCE_LOAD |
|--------|-----------------|-------------------|
| Templates | 8 | 6 |
| Service type | NodePort | ClusterIP |
| `container.vault.*` | Present (unused) | Removed |
| GHCR ExternalSecret | Always created | Removed (public image) |
| ServiceAccount | Always created | Removed |
| Monitoring annotations | Istio sidecar (15020) | None (add later) |
| `imagePullSecrets` | Always present | Removed |
| runtimeClassName | (none) | `nvidia` |
| nodeSelector | (none) | `nvidia.com/gpu.present: "true"` |
| GPU resources | (none) | `nvidia.com/gpu` limit |
| Extra env vars | (none) | `MODEL_ID`, `REVISION`, etc. |

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
    ├── ingressCert.yaml
    └── externalSecret.yaml

/src/workloadChartValues/
├── mlInferenceLoad.ts              # New file
└── workloadSchema.ts               # Updated union type

/.cat/backstage/
└── ml-inference-load.yaml          # New catalog entry
```

---

## 8. Testing Plan

1. **Helm lint** - Validate chart syntax
2. **Helm template** - Verify generated manifests
3. **Deploy to dev** - Single GPU test environment
4. **Verify model loading** - Check logs for successful model load
5. **Test inference** - `curl POST /generate`
6. **Test health endpoint** - Verify probes work
7. **Test ingress** - External access via Gateway + HTTPRoute

---

## 9. Future Enhancements (Out of Scope for v1)

| Enhancement | Notes |
|-------------|-------|
| Model caching (PVC) | Mount NFS volume for `/data`, set `HUGGINGFACE_HUB_CACHE` |
| Monitoring | Add prometheus annotations once we know what to scrape |
| HPA | Scaling based on queue depth or GPU utilization |
| Multi-GPU | Chart supports `gpu.count > 1`, just needs testing |
| Quantization | Can use `container.environment` for now |

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

Based on existing chart templates, we generate **8 manifests** (matching BASIC_CONTAINER_LOAD pattern exactly, plus GPU modifications):

### 2.1 Deployment

Based on `charts/basic-container-load/templates/deployment.yaml`:

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
  {{- if not .Values.container.hpa.enabled }}
  replicas: {{ .Values.container.replicas }}
  {{- end }}
  revisionHistoryLimit: {{ .Values.revisionHistoryLimit | default 2 }}
  selector:
    matchLabels:
      app: {{ .Values.serviceName }}
  template:
    metadata:
      annotations:
        {{- if .Values.basicMonitoring.enabled }}
        prometheus.io/scrape: "true"
        prometheus.io/port: "15020"
        prometheus.io/path: /stats/prometheus
        {{- end }}
      labels:
        app: {{ .Values.serviceName }}
        version: {{ .Values.container.image.tag | quote }}
        catalog: {{ .Values.serviceCatalog }}
    spec:
      # GPU-SPECIFIC: nvidia runtime class
      runtimeClassName: nvidia
      # GPU-SPECIFIC: schedule on GPU nodes
      nodeSelector:
        nvidia.com/gpu.present: "true"
      {{- if .Values.serviceAccount }}
      serviceAccountName: {{ .Values.serviceAccount }}
      {{- end }}
      imagePullSecrets:
        - name: {{ .Values.serviceName }}-ghcr-docker-config
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
              # GPU-SPECIFIC: GPU resource limit
              nvidia.com/gpu: {{ .Values.gpu.count }}
          {{- if or .Values.container.environment .Values.container.secrets }}
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
          {{- end }}
```

### 2.2 Service

Based on `charts/basic-container-load/templates/service.yaml`:

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
  type: NodePort
  selector:
    app: {{ .Values.serviceName }}
```

### 2.3 Gateway

Based on `charts/basic-container-load/templates/gateway.yaml`:

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

Based on `charts/basic-container-load/templates/httRoute.yaml`:

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

### 2.5 Certificate

Based on `charts/basic-container-load/templates/ingressCert.yaml`:

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

### 2.6 ServiceAccount

Based on `charts/basic-container-load/templates/serviceaccount.yaml`:

```yaml
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: {{ .Values.serviceName }}-external-secrets
  namespace: {{ .Values.namespace }}
```

### 2.7 ExternalSecret (GHCR Docker Config)

Based on `charts/basic-container-load/templates/ghcr.external-secret.yaml`:

**NOTE:** Always created (not conditional). Hardcoded path to shared GHCR credentials.

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: {{ .Values.serviceName }}-ghcr-docker-config
  namespace: {{ .Values.namespace }}
spec:
  secretStoreRef:
    name: {{ .Values.container.secretStore.name }}
    kind: ClusterSecretStore
  target:
    name: {{ .Values.serviceName }}-ghcr-docker-config
    creationPolicy: Owner
    template:
      type: 'kubernetes.io/dockerconfigjson'
  data:
    - secretKey: .dockerconfigjson
      remoteRef:
        key: shared/ghcr/dockerconfigjson
        property: dockerconfigjson
  refreshInterval: 1m
```

### 2.8 ExternalSecret (Service Secrets)

Based on `charts/basic-container-load/templates/ServiceExternalSecrets.yaml`:

```yaml
{{- if .Values.container.secrets }}
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: {{ .Values.serviceName }}-secrets
  namespace: {{ .Values.namespace }}
spec:
  refreshInterval: 1s
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

## 3. Values Schema

**Matching existing chart structure exactly**, with ML-specific additions:

```yaml
workloadType: ML_INFERENCE_LOAD
serviceName: &svcName my-llm-service
nameOverride: *svcName
serviceCatalog: ml-team
basicMonitoring:
  enabled: true
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

# Container config (MATCHES EXISTING PATTERN EXACTLY)
container:
  vault:
    key: "path_to_secret"
    server: "http://vault.vault.svc.cluster.local:8200"
    role: "external-secrets-role"
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
  secretRefreshInterval: 5m
  livenessProbe:
    enabled: true
    type: "http"
    path: "/health"
    port: 8080
    scheme: "HTTP"
    initialDelaySeconds: 120    # Longer for model loading
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
    initialDelaySeconds: 120    # Longer for model loading
    timeoutSeconds: 10
    periodSeconds: 30
    successThreshold: 1
    failureThreshold: 3
  hpa:
    enabled: false
    targetCpu: 80
    minReplicas: 1
    maxReplicas: 3
  environment: []
  secrets:
    - name: HUGGING_FACE_HUB_TOKEN
      secretKey: hf-token
      vaultPath: /secret/shared/huggingface/token
```

---

## 4. TypeScript Interface

```typescript
// /src/workloadChartValues/mlInferenceLoad.ts

import {
    ContainerHpaProperties,
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
    basicMonitoring?: {
        enabled: boolean;
    };

    // ML-specific
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

    // Standard container config (matches BasicContainerLoadSchema exactly)
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

## 5. Key Observations from Existing Charts

| Pattern | Actual Implementation |
|---------|----------------------|
| Service type | `NodePort` (not ClusterIP) |
| containerPorts | Array with `portName`, `portNumber`, `protocol`, `servicePort` |
| Probes | Under `container.livenessProbe.*` with `enabled`, `type`, full config |
| Monitoring annotations | Point to Istio sidecar: port `15020`, path `/stats/prometheus` |
| GHCR ExternalSecret | Always created, not conditional |
| Certificate | cert-manager with `letsencrypt-prod` ClusterIssuer |
| ServiceAccount | Always created: `{{ .serviceName }}-external-secrets` |
| `container.vault.*` | In values but NOT referenced in any template |
| `container.secretStore.name` | Used in ExternalSecrets to reference ClusterSecretStore |

---

## 6. Comparison with BASIC_CONTAINER_LOAD

| Aspect | BASIC_CONTAINER_LOAD | ML_INFERENCE_LOAD |
|--------|---------------------|-------------------|
| K8s Primitive | Deployment | Deployment |
| runtimeClassName | (none) | `nvidia` |
| nodeSelector | (none) | `nvidia.com/gpu.present: "true"` |
| Resource limits | CPU/Memory | CPU/Memory + `nvidia.com/gpu` |
| Probe defaults | 10s initialDelay | 120s initialDelay (model load time) |
| Extra env vars | (none) | `MODEL_ID`, `REVISION`, `MAX_INPUT_LENGTH`, `MAX_TOTAL_TOKENS` |
| New values fields | (none) | `model.*`, `inference.*`, `gpu.*` |

Everything else is identical: Service (NodePort), Gateway, HTTPRoute, Certificate, ServiceAccount, ExternalSecrets.

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
    ├── serviceaccount.yaml
    ├── ghcr.external-secret.yaml
    └── ServiceExternalSecrets.yaml

/src/workloadChartValues/
├── mlInferenceLoad.ts              # New file
└── workloadSchema.ts               # Updated union type

/.cat/backstage/
└── ml-inference-load.yaml          # New catalog entry
```

---

## 8. Testing Plan

1. **Helm lint** - Validate chart syntax
2. **Helm template** - Verify generated manifests match BASIC_CONTAINER_LOAD structure
3. **Diff test** - Compare output to BASIC_CONTAINER_LOAD, verify only expected differences
4. **Deploy to dev** - Single GPU test environment
5. **Verify model loading** - Check logs for successful model load
6. **Test inference** - `curl POST /generate`
7. **Test health endpoint** - Verify probes work
8. **Test ingress** - External access via Gateway + HTTPRoute

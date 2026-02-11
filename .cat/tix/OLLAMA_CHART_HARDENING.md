# Ollama Inference Load Chart Hardening

## Summary

Harden the `ollama-inference-load` chart to production-readiness before building downstream consumers (RAG KB etc). This epic addresses every known limitation identified in the original POC and adds operational features that the other chart types already have.

## Current State

The chart works but has these gaps:

- Single model only, specified as a string
- `emptyDir` volume -- model re-downloaded on every pod restart (multi-GB)
- Hardcoded nvidia GPU runtime -- no CPU-only dev/test path
- Resource defaults will OOM on anything larger than `phi`
- Init container uses `sleep 5` hack to wait for ollama server
- No startup probe -- pod crashloops if model load exceeds `initialDelaySeconds`
- No secrets plumbing (vault/secretStore/ExternalSecret) unlike other charts
- No `OLLAMA_NUM_PARALLEL` or `OLLAMA_KEEP_ALIVE` configuration

## Files Touched

Every ticket in this epic touches a subset of these files:

| File | Purpose |
|------|---------|
| `charts/ollama-inference-load/values.yaml` | Default values |
| `charts/ollama-inference-load/values.schema.json` | JSON Schema for validation |
| `charts/ollama-inference-load/templates/deployment.yaml` | Deployment template |
| `charts/ollama-inference-load/templates/externalSecret.yaml` | New -- ExternalSecret template |
| `src/workloadChartValues/ollamaInferenceLoad.ts` | TypeScript interface |

---

## Ticket Breakdown

### OLLAMA_HARDENING_01: Multi-model support

**Goal**: Change `model` from a single string to a primary model + optional additional models.

**Values change** (`values.yaml`):

```yaml
# BEFORE
model: "phi"

# AFTER
models:
  primary: "phi"
  additional: []
```

**Schema change** (`values.schema.json`):

- Remove `model` string property
- Add `models` object with:
  - `primary`: `{ "type": "string" }` (required)
  - `additional`: `{ "type": "array", "items": { "type": "string" }, "default": [] }`
- Update `required` array: replace `"model"` with `"models"`

**TypeScript change** (`ollamaInferenceLoad.ts`):

```typescript
// BEFORE
model: string;

// AFTER
models: {
    primary: string;
    additional?: string[];
};
```

**Template change** (`deployment.yaml` init container command):

```yaml
# BEFORE
ollama pull {{ .Values.model }}

# AFTER
ollama pull {{ .Values.models.primary }}
{{- range .Values.models.additional }}
ollama pull {{ . }}
{{- end }}
```

**Acceptance criteria**:

- `npm run validate` passes
- `npm test` passes
- `helm template` renders correct init container with single model
- `helm template` renders correct init container with primary + 2 additional models

---

### OLLAMA_HARDENING_02: Persistent volume for model data

**Goal**: Replace `emptyDir` with an optional PVC so models survive pod restarts.

**Values change** (`values.yaml`):

```yaml
# ADD after gpu section
storage:
  enabled: false
  size: "10Gi"
  storageClass: ""
  accessMode: "ReadWriteOnce"
```

**Schema change** (`values.schema.json`):

- Add `storage` object property:
  - `enabled`: `{ "type": "boolean" }`
  - `size`: `{ "type": "string" }`
  - `storageClass`: `{ "type": "string" }`
  - `accessMode`: `{ "type": "string" }`
- `additionalProperties: false`

**TypeScript change** (`ollamaInferenceLoad.ts`):

```typescript
// ADD
storage?: {
    enabled: boolean;
    size: string;
    storageClass?: string;
    accessMode?: string;
};
```

**Template change** (`deployment.yaml` volumes section):

```yaml
# BEFORE
volumes:
  - name: ollama-data
    emptyDir: {}

# AFTER
volumes:
  - name: ollama-data
    {{- if .Values.storage.enabled }}
    persistentVolumeClaim:
      claimName: {{ .Values.serviceName }}-ollama-data
    {{- else }}
    emptyDir: {}
    {{- end }}
```

**New template** (`templates/pvc.yaml`):

```yaml
{{- if .Values.storage.enabled }}
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: {{ .Values.serviceName }}-ollama-data
  namespace: {{ .Values.namespace }}
  labels:
    app: {{ .Values.serviceName }}
spec:
  accessModes:
    - {{ .Values.storage.accessMode | default "ReadWriteOnce" }}
  {{- if .Values.storage.storageClass }}
  storageClassName: {{ .Values.storage.storageClass }}
  {{- end }}
  resources:
    requests:
      storage: {{ .Values.storage.size }}
{{- end }}
```

**Acceptance criteria**:

- `storage.enabled: false` renders `emptyDir` (backwards compatible)
- `storage.enabled: true` renders PVC and references it in deployment
- `npm run validate` passes
- `npm test` passes

---

### OLLAMA_HARDENING_03: GPU type field and CPU-only mode

**Goal**: Make GPU configuration portable. Support nvidia, amd, and none (CPU-only for dev/test).

**Values change** (`values.yaml`):

```yaml
# BEFORE
gpu:
  count: 1

# AFTER
gpu:
  enabled: true
  type: "nvidia"
  count: 1
```

**Schema change** (`values.schema.json`):

- Add to `gpu` properties:
  - `enabled`: `{ "type": "boolean" }`
  - `type`: `{ "type": "string", "enum": ["nvidia", "amd"] }`
- Keep `count` as-is
- Update `required` inside `gpu` to `["enabled", "count"]`

**TypeScript change** (`ollamaInferenceLoad.ts`):

```typescript
// BEFORE
gpu: {
    count: number;
};

// AFTER
gpu: {
    enabled: boolean;
    type?: "nvidia" | "amd";
    count: number;
};
```

**Template change** (`deployment.yaml`):

```yaml
# BEFORE (hardcoded nvidia)
spec:
  runtimeClassName: nvidia
  nodeSelector:
    nvidia.com/gpu.present: "true"
  ...
  # and in resources:
  nvidia.com/gpu: {{ .Values.gpu.count }}

# AFTER (conditional)
spec:
  {{- if .Values.gpu.enabled }}
  {{- if eq .Values.gpu.type "nvidia" }}
  runtimeClassName: nvidia
  nodeSelector:
    nvidia.com/gpu.present: "true"
  {{- else if eq .Values.gpu.type "amd" }}
  nodeSelector:
    amd.com/gpu.present: "true"
  {{- end }}
  {{- end }}
  ...
  # In resources (both init and main container):
  {{- if .Values.gpu.enabled }}
  {{- if eq .Values.gpu.type "nvidia" }}
  nvidia.com/gpu: {{ .Values.gpu.count }}
  {{- else if eq .Values.gpu.type "amd" }}
  amd.com/gpu: {{ .Values.gpu.count }}
  {{- end }}
  {{- end }}
```

**Acceptance criteria**:

- `gpu.enabled: true, type: nvidia` renders current nvidia behaviour (backwards compatible)
- `gpu.enabled: true, type: amd` renders AMD node selector and resource limits
- `gpu.enabled: false` renders no runtimeClassName, no nodeSelector, no GPU resource limits
- `npm run validate` passes
- `npm test` passes

---

### OLLAMA_HARDENING_04: Fix init container model pull (replace sleep hack)

**Goal**: Replace `sleep 5` with proper health polling before pulling model.

**Template change** (`deployment.yaml` init container command):

```yaml
# BEFORE
command:
  - /bin/sh
  - -c
  - |
    ollama serve &
    sleep 5
    ollama pull {{ .Values.model }}

# AFTER
command:
  - /bin/sh
  - -c
  - |
    ollama serve &
    until curl -sf http://localhost:11434/ > /dev/null 2>&1; do
      echo "Waiting for ollama to start..."
      sleep 1
    done
    echo "Ollama is ready, pulling models..."
    ollama pull {{ .Values.models.primary }}
    {{- range .Values.models.additional }}
    ollama pull {{ . }}
    {{- end }}
```

Note: This depends on OLLAMA_HARDENING_01 (multi-model) being applied first. The template references `.Values.models.primary` not `.Values.model`.

**Acceptance criteria**:

- Init container polls `/` until 200 before pulling
- No more `sleep 5`
- `helm template` renders correct script

---

### OLLAMA_HARDENING_05: Startup probe

**Goal**: Add a startup probe so Kubernetes waits for model loading without killing the pod. Separate from liveness/readiness.

**Values change** (`values.yaml`):

```yaml
# ADD to container section, after readinessProbe
startupProbe:
  enabled: true
  type: "http"
  path: "/api/tags"
  port: 11434
  scheme: "HTTP"
  initialDelaySeconds: 10
  timeoutSeconds: 5
  periodSeconds: 10
  successThreshold: 1
  failureThreshold: 30
```

Using `/api/tags` because it returns the list of loaded models -- if it returns a non-empty list, the model is loaded and ready. `failureThreshold: 30` with `periodSeconds: 10` gives 5 minutes for model loading.

**Schema change** (`values.schema.json`):

- Add `startupProbe` to `container.properties` with same shape as `livenessProbe`/`readinessProbe`

**TypeScript change** (`ollamaInferenceLoad.ts`):

```typescript
// ADD to container block
startupProbe?: ContainerProbeProperties;
```

**Template change** (`deployment.yaml`, add after readinessProbe block):

```yaml
{{- if .Values.container.startupProbe.enabled }}
startupProbe:
  {{- with .Values.container.startupProbe }}
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
```

**Why `/api/tags` not `/`**: The root endpoint returns 200 as soon as Ollama starts, even before any model is loaded. `/api/tags` returns the model list -- when combined with a check, this confirms the model is actually available. For the startup probe we just need Ollama to be responsive; the init container handles ensuring the model is pulled. So `/api/tags` returning 200 (even with empty list) is fine as a startup signal.

**Acceptance criteria**:

- Startup probe renders when enabled
- Does not render when `startupProbe.enabled: false`
- `npm run validate` passes
- `npm test` passes

---

### OLLAMA_HARDENING_06: Secrets plumbing (vault, secretStore, ExternalSecret)

**Goal**: Add vault/secretStore/secrets support matching the pattern in `basic-container-load` and `ml-inference-load`. Needed for accessing gated models, external API keys, etc.

**Values change** (`values.yaml`):

```yaml
# ADD to container section
vault:
  key: "path_to_secret"
  server: "http://vault.vault.svc.cluster.local:8200"
  role: "external-secrets-role"
secretStore:
  name: vault-backend
secretRefreshInterval: 1h
secrets: []
```

**Schema change** (`values.schema.json`):

- Add to `container.properties`:
  - `vault`: `{ properties: { key: string, server: string, role: string }, additionalProperties: false }`
  - `secretStore`: `{ properties: { name: string }, additionalProperties: false }`
  - `secretRefreshInterval`: `{ "type": "string" }`
  - `secrets`: `{ "type": "array" }`

**TypeScript change** (`ollamaInferenceLoad.ts`):

```typescript
// ADD to container block
vault?: {
    key: string;
    server: string;
    role: string;
};
secretStore?: {
    name: string;
};
secretRefreshInterval?: string;
secrets?: SecretObj[];
```
Also add `SecretObj` to the imports from `"../shared"`.

**New template** (`templates/externalSecret.yaml`):
Copy from `basic-container-load/templates/ServiceExternalSecrets.yaml` -- same pattern:

```yaml
{{- if .Values.container.secrets }}
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: {{ .Values.serviceName }}-secrets
  namespace: {{ .Values.namespace }}
spec:
  refreshInterval: {{ .Values.container.secretRefreshInterval | default "24h" }}
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

**Template change** (`deployment.yaml`):
Add envFrom to the main container when secrets exist:

```yaml
{{- if .Values.container.secrets }}
envFrom:
  - secretRef:
      name: {{ .Values.serviceName }}-secrets
{{- end }}
```

**Acceptance criteria**:

- No secrets configured: no ExternalSecret rendered, no envFrom on container
- Secrets configured: ExternalSecret rendered, envFrom references the secret
- Pattern matches `basic-container-load` exactly
- `npm run validate` passes
- `npm test` passes

---

### OLLAMA_HARDENING_07: Ollama runtime environment variables

**Goal**: Expose `OLLAMA_NUM_PARALLEL` and `OLLAMA_KEEP_ALIVE` as explicit values fields (following the "explicit fields for operational config" pattern).

**Values change** (`values.yaml`):

```yaml
# ADD after models section
ollama:
  numParallel: 1
  keepAlive: "5m"
```

**Schema change** (`values.schema.json`):

- Add `ollama` object property:
  - `numParallel`: `{ "type": "integer", "minimum": 1 }`
  - `keepAlive`: `{ "type": "string" }`
- `additionalProperties: false`

**TypeScript change** (`ollamaInferenceLoad.ts`):

```typescript
// ADD
ollama?: {
    numParallel?: number;
    keepAlive?: string;
};
```

**Template change** (`deployment.yaml`, main container env section):
These get injected as environment variables on the main container, before the user-supplied `container.environment` array:

```yaml
env:
  {{- if .Values.ollama }}
  {{- if .Values.ollama.numParallel }}
  - name: OLLAMA_NUM_PARALLEL
    value: {{ .Values.ollama.numParallel | quote }}
  {{- end }}
  {{- if .Values.ollama.keepAlive }}
  - name: OLLAMA_KEEP_ALIVE
    value: {{ .Values.ollama.keepAlive | quote }}
  {{- end }}
  {{- end }}
  {{- range .Values.container.environment }}
  - name: {{ .name }}
    value: {{ .value | quote }}
  {{- end }}
```

Note: This changes the env block from being conditional (`{{- if .Values.container.environment }}`) to always rendered with the ollama vars first, then the user-supplied ones. The `env:` key should always be present now.

**Acceptance criteria**:

- Default values render `OLLAMA_NUM_PARALLEL=1` and `OLLAMA_KEEP_ALIVE=5m`
- Custom values override correctly
- User-supplied `container.environment` entries still render after ollama vars
- `npm run validate` passes
- `npm test` passes

---

### OLLAMA_HARDENING_08: Update validate script and run full test

**Goal**: Verify everything works end-to-end after all changes.

**Steps**:

1. Run `npm run validate` -- confirms all chart `values.yaml` files pass their schemas
2. Run `npm test` -- confirms `validate` + `tsc --noEmit` both pass
3. Run `helm template charts/ollama-inference-load` with default values -- confirms template renders
4. Run `helm template` with overrides to exercise all new features:
   - Multi-model (`models.primary` + `models.additional`)
   - PVC enabled (`storage.enabled: true`)
   - CPU-only (`gpu.enabled: false`)
   - Secrets configured
   - Startup probe enabled
   - Ollama runtime vars set

**Acceptance criteria**:

- All validation passes
- TypeScript compiles
- Helm template renders cleanly for all combinations
- No regressions on other charts

---

## Dependency Order

```
01 (multi-model) ──┐
                   ├──▶ 04 (fix init container) ──▶ 08 (final validation)
02 (PVC)     ──────┤
03 (GPU type) ─────┤
05 (startup probe) ┤
06 (secrets) ──────┤
07 (ollama env) ───┘
```

Tickets 01, 02, 03, 05, 06, 07 are independent of each other.
Ticket 04 depends on 01 (references `models.primary`).
Ticket 08 is the final validation after all others.

---

*Created: 2026-02-11*
*Status: Draft*

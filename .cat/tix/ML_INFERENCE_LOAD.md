# Story: Add ML_INFERENCE_LOAD Helm Chart

**Status:** PENDING
**Type:** Feature
**Priority:** Normal

---

## Summary

Add a new workload type `ML_INFERENCE_LOAD` to the platform-schemas-types repository for deploying ML inference workloads that serve Hugging Face models via HTTP using Text Generation Inference (TGI).

---

## Acceptance Criteria

- [ ] New Helm chart at `/charts/ml-inference-load/`
- [ ] TypeScript interface `MlInferenceLoadSchema` in `/src/workloadChartValues/`
- [ ] Union type updated in `workloadSchema.ts`
- [ ] JSON Schema for values validation
- [ ] Backstage catalog entry in `/.cat/backstage/`
- [ ] Chart generates 8 manifests (matching BASIC_CONTAINER_LOAD):
  - Deployment (with GPU: runtimeClassName, nodeSelector, nvidia.com/gpu limit)
  - Service (NodePort)
  - Gateway (gatewayClassName: istio)
  - HTTPRoute
  - Certificate (cert-manager, letsencrypt-prod)
  - ServiceAccount
  - ExternalSecret (GHCR docker config - always created)
  - ExternalSecret (service secrets - conditional on `container.secrets`)
- [ ] GPU scheduling works (nvidia runtime, node selector, resource limits)
- [ ] HF token pulled from Vault via `container.secrets` array pattern
- [ ] Values structure matches existing chart patterns exactly

---

## Out of Scope (v1)

- PVC for model caching (deferred - downloading is cheap)
- Dedicated quantization field (use `container.environment` array if needed)
- HPA / multiple replicas (single replica POC)
- Multiple GPU testing (chart supports it, but testing limited to 1 GPU)

---

## Technical Design

See: [ML_INFERENCE_LOAD_design.md](./ML_INFERENCE_LOAD_design.md)

---

## Dependencies

- Cluster must have NVIDIA GPU operator installed
- Cluster must have nodes with `nvidia.com/gpu.present: "true"` label
- Vault must have HF token at configured path
- `vault-backend` ClusterSecretStore must exist
- `shared/ghcr/dockerconfigjson` must exist in Vault (used by all charts)

---

## Resolved Questions

### Q1: ServiceMonitor ✓

**Resolution:** Use annotation-based monitoring via `basicMonitoring.enabled` pattern (same as existing charts). Note: annotations point to Istio sidecar (port 15020, path /stats/prometheus), not the app's own metrics. Prometheus agent in cluster uses annotations for discovery. If ServiceMonitor is needed later, it goes in catalog init workload, not individual workloads.

### Q2: Gateway + HTTPRoute ✓

**Resolution:** Follow existing pattern exactly:
- Gateway with `gatewayClassName: istio`, TLS termination referencing Certificate
- HTTPRoute referencing per-service gateway
- Certificate from cert-manager with `letsencrypt-prod` ClusterIssuer

### Q3: Model ID + Revision ✓

**Resolution:** Both `model.id` and `model.revision` are required fields with no defaults. Catalog entry must specify both explicitly (like `container.image.repository` + `container.image.tag`).

### Q4: Quantization ✓

**Resolution:** No dedicated field for v1. Users can pass quantization via the `container.environment` array if needed:
```yaml
container:
  environment:
    - name: QUANTIZE
      value: bitsandbytes
```

### Q5: HF Token via Secrets Array ✓

**Resolution:** Use the existing `container.secrets` array pattern:
```yaml
container:
  secrets:
    - name: HUGGING_FACE_HUB_TOKEN
      secretKey: hf-token
      vaultPath: /secret/shared/huggingface/token
```

### Q6: GHCR Pull Secret ✓

**Resolution:** GHCR ExternalSecret is **always created** (not conditional) - matches existing charts. It uses a hardcoded path `shared/ghcr/dockerconfigjson` and creates `{{ .serviceName }}-ghcr-docker-config` secret for imagePullSecrets.

---

## Key Patterns Confirmed from Template Review

| Pattern | Implementation |
|---------|---------------|
| Service type | `NodePort` |
| containerPorts | Array: `portName`, `portNumber`, `protocol`, `servicePort` |
| Probes | `container.livenessProbe.*` with `enabled`, `type`, full config |
| Monitoring | Istio sidecar: port `15020`, path `/stats/prometheus` |
| GHCR secret | Always created, hardcoded path |
| Certificate | cert-manager, `letsencrypt-prod` ClusterIssuer |
| ServiceAccount | Always created: `{{ .serviceName }}-external-secrets` |
| `container.vault.*` | Present in values but NOT used in templates |
| `container.secretStore.name` | Used by ExternalSecrets for ClusterSecretStore ref |

---

## Notes

- This is a POC to understand ML inference on the platform
- Start simple, iterate based on learnings
- GPU count configurable in values but testing limited to single GPU environment

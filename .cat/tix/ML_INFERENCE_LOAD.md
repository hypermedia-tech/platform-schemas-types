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
- [ ] Chart generates: Deployment, Service, Gateway, HTTPRoute, ExternalSecret
- [ ] GPU scheduling works (nvidia runtime, node selector, resource limits)
- [ ] HF token pulled from Vault via `secrets` array pattern
- [ ] Values structure matches existing chart patterns
- [ ] GHCR pull secret optional (for future private registry use)

---

## Out of Scope (v1)

- PVC for model caching (deferred - downloading is cheap)
- Dedicated quantization field (use `environment` array if needed)
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

---

## Resolved Questions

### Q1: ServiceMonitor ✓

**Resolution:** Use annotation-based monitoring via `basicMonitoring.enabled` pattern (same as existing charts). Prometheus agent in cluster uses annotations for discovery. If ServiceMonitor is needed later, it goes in catalog init workload, not individual workloads.

### Q2: Gateway + HTTPRoute ✓

**Resolution:** Follow existing pattern exactly - Gateway + HTTPRoute. The Gateway uses `gatewayClassName: istio` and terminates TLS. HTTPRoute references the per-service gateway.

### Q3: Model ID + Revision ✓

**Resolution:** Both `model.id` and `model.revision` are required fields with no defaults. Catalog entry must specify both explicitly (like `image.repository` + `image.tag`).

### Q4: Quantization ✓

**Resolution:** No dedicated field for v1. Users can pass quantization via the `environment` array if needed:
```yaml
environment:
  - name: QUANTIZE
    value: bitsandbytes
```

### Q5: HF Token via Secrets Array ✓

**Resolution:** Use the existing `secrets` array pattern, not a separate vault path field. The `vault` section configures the Vault connection; `secrets` array specifies individual secrets:
```yaml
secrets:
  - name: HUGGING_FACE_HUB_TOKEN
    secretKey: hf-token
    vaultPath: /secret/shared/huggingface/token
```

### Q6: GHCR Pull Secret ✓

**Resolution:** Keep it optional. Currently TGI is public, but eventually may point to private registry. Pattern:
```yaml
imagePullSecret:
  enabled: false  # Optional, for future private registry
```

---

## Notes

- This is a POC to understand ML inference on the platform
- Start simple, iterate based on learnings
- GPU count configurable in values but testing limited to single GPU environment

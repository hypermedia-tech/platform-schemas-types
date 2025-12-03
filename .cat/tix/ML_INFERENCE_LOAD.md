# Story: Add ML_INFERENCE_LOAD Helm Chart

**Status:** PENDING
**Type:** Feature
**Priority:** Normal

---

## Summary

Add a new workload type `ML_INFERENCE_LOAD` to the platform-schemas-types repository for deploying ML inference workloads that serve Hugging Face models via HTTP using Text Generation Inference (TGI).

This chart is intentionally **minimal** - removing unused patterns from existing charts while adding GPU support.

---

## Acceptance Criteria

- [ ] New Helm chart at `/charts/ml-inference-load/`
- [ ] TypeScript interface `MlInferenceLoadSchema` in `/src/workloadChartValues/`
- [ ] Union type updated in `workloadSchema.ts`
- [ ] JSON Schema for values validation
- [ ] Backstage catalog entry in `/.cat/backstage/`
- [ ] Chart generates **6 templates**:
  - Deployment (with GPU: runtimeClassName, nodeSelector, nvidia.com/gpu limit)
  - Service (ClusterIP)
  - Gateway (gatewayClassName: istio)
  - HTTPRoute
  - Certificate (cert-manager, letsencrypt-prod)
  - ExternalSecret (for HF token via `container.secrets`)
- [ ] GPU scheduling works (nvidia runtime, node selector, resource limits)
- [ ] HF token pulled from Vault via `container.secrets` array pattern

---

## Simplifications from Existing Charts

| Removed | Reason |
|---------|--------|
| `container.vault.*` | Not used in any existing template (dead config) |
| GHCR ExternalSecret | TGI image is public |
| ServiceAccount template | Appears orphaned in existing charts |
| NodePort → ClusterIP | Gateway handles external access |
| Monitoring annotations | Add later when we understand what we need |
| `imagePullSecrets` | No private registry for TGI |

---

## Out of Scope (v1)

- PVC for model caching (deferred - downloading is cheap)
- Dedicated quantization field (use `container.environment` array)
- HPA / multiple replicas (single replica POC)
- Monitoring annotations (configure once deployed)
- Multiple GPU testing (chart supports it, testing limited to 1 GPU)

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

## Design Decisions

### Service Type: ClusterIP (not NodePort)

Existing charts use NodePort, likely legacy from before Gateway API. With MetalLB + Gateway handling external access, ClusterIP is sufficient. Gateway gets the external IP, routes to ClusterIP service internally.

### No GHCR Pull Secret

TGI image is public (`ghcr.io/huggingface/text-generation-inference`). Can add back if we later point to a private registry.

### No Monitoring Annotations

Existing charts scrape Istio sidecar (port 15020). For ML workloads, we may want app-level metrics (TGI's `/metrics`). Will configure once we have something running and understand requirements.

### Model ID + Revision Required

Both `model.id` and `model.revision` are required with no defaults - explicit like `container.image.repository` + `container.image.tag`.

---

## Notes

- This is a POC to understand ML inference on the platform
- Start minimal, add complexity only when needed
- GPU count configurable in values but testing limited to single GPU environment
- Consider backporting simplifications (ClusterIP, removing dead config) to other charts

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
- [ ] Chart generates: Deployment, Service, HTTPRoute, ExternalSecret
- [ ] GPU scheduling works (nvidia runtime, node selector, resource limits)
- [ ] HF token pulled from Vault via ExternalSecret
- [ ] Values structure matches existing chart patterns

---

## Out of Scope (v1)

- PVC for model caching (deferred - downloading is cheap)
- ServiceMonitor for Prometheus (needs cluster config discussion)
- HPA / multiple replicas (single replica POC)
- Multiple GPU support (chart will support it, but testing limited to 1 GPU)

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

## Questions Requiring Answers

### Q1: ServiceMonitor - Do we need it for v1?

You mentioned an "agent running in the cluster that has the GPU."

**Context:** A `ServiceMonitor` is a Prometheus Operator CRD that tells Prometheus to scrape metrics from a service. TGI exposes metrics at `GET /metrics`. For Prometheus to discover and scrape these metrics, one of these must be true:

1. **ServiceMonitor approach:** We create a ServiceMonitor CRD, and your Prometheus Operator is configured to watch the namespace (via `serviceMonitorNamespaceSelector`)
2. **Annotation approach:** We add `prometheus.io/scrape: "true"` annotations to the pod (like your existing charts do), and Prometheus is configured to discover via annotations
3. **Manual approach:** Someone manually adds the scrape target to Prometheus config

**Question:** Which approach does your cluster use? If it's the annotation approach (like `basicMonitoring.enabled` in existing charts), we can skip ServiceMonitor entirely and just use annotations.

### Q2: HTTPRoute parentRef - What Gateway?

Looking at your existing `httRoute.yaml`, it references:
```yaml
parentRefs:
  - name: {{ .Values.serviceName }}-gateway
```

But you said "no gateway, just HTTPRoute" with Ambient Istio.

**Question:** In Ambient Istio, what should the `parentRef` point to? Is there a shared Gateway resource in the cluster, or does Ambient Istio not require a parentRef at all?

### Q3: Model Image Pattern Clarification

You said model revision should be like `image.repository` / `image.tag` - explicit, not defaulted. I agree.

**Proposed structure:**
```yaml
model:
  id: 'meta-llama/Llama-3.2-1B'    # Required - HF model ID
  revision: 'main'                  # Required - explicit, like image.tag
```

Both required, no defaults. The catalog entry must specify both. Is this correct?

### Q4: Quantization - Do we need it for v1?

**What it is:** Quantization reduces model precision (e.g., from 16-bit to 8-bit or 4-bit) to use less GPU memory. This lets you run larger models on smaller GPUs. TGI supports several methods:

| Method | Description | Memory Savings |
|--------|-------------|----------------|
| `bitsandbytes` | 8-bit/4-bit quantization | ~50-75% |
| `gptq` | 4-bit with calibration | ~75% |
| `awq` | Activation-aware 4-bit | ~75% |
| `eetq` | 8-bit optimized | ~50% |

**Trade-off:** Lower precision = less memory but slightly lower quality outputs.

**Question:** For v1 POC, do you want quantization support, or should we defer it? If deferred, users could still pass it via the `environment` array as a custom env var.

### Q5: Vault Path Structure

Your existing charts use:
```yaml
container:
  vault:
    key: "path_to_secret"
```

For HF token, the prompt suggested `/secret/shared/huggingface/token`.

**Question:** Should this follow the same pattern as existing charts (configurable path), or is HF token path standardized across environments?

### Q6: GHCR Pull Secret

Existing charts create a `ghcr.external-secret.yaml` for pulling images from GHCR. TGI images are public on `ghcr.io/huggingface/text-generation-inference`.

**Question:** Do we still need imagePullSecrets for public GHCR images, or can we skip that for TGI?

---

## Notes

- This is a POC to understand ML inference on the platform
- Start simple, iterate based on learnings
- GPU count configurable in values but testing limited to single GPU environment

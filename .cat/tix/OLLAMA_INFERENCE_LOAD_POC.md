# OLLAMA_INFERENCE_LOAD - Proof of Concept

## Summary

Successfully deployed an LLM inference service via the GitOps catalog system using Ollama runtime on an NVIDIA RTX 5070 Ti (Blackwell architecture).

## Problem Statement

The original `ML_INFERENCE_LOAD` chart using Hugging Face TGI failed on RTX 5070 Ti due to PyTorch lacking support for CUDA compute capability sm_120 (Blackwell). This is a known issue - PyTorch stable builds only support up to sm_90.

## Solution

Created `OLLAMA_INFERENCE_LOAD` chart using Ollama as the inference runtime. Ollama uses llama.cpp under the hood, which compiles CUDA kernels directly and supports newer GPU architectures faster than the Python ML stack.

## What Was Proven

1. **GitOps-driven LLM deployment works** - Model specified in catalog leaf, deployed via ArgoCD
2. **Ollama on Blackwell GPU works** - RTX 5070 Ti runs inference successfully
3. **OpenAI-compatible API available** - Service responds at `/api/generate`, `/api/chat`, `/v1/chat/completions`
4. **Init container model pull works** - Model pulled at pod startup before main container serves requests

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Pod                                                     │
│  ┌─────────────────┐    ┌─────────────────────────────┐ │
│  │ Init Container  │───▶│ Main Container (ollama)     │ │
│  │ ollama pull     │    │ ollama serve on :11434      │ │
│  └────────┬────────┘    └──────────────┬──────────────┘ │
│           │                            │                │
│           └──────────┬─────────────────┘                │
│                      ▼                                  │
│              ┌───────────────┐                          │
│              │ emptyDir vol  │                          │
│              │ /root/.ollama │                          │
│              └───────────────┘                          │
└─────────────────────────────────────────────────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │ ClusterIP Svc   │
              │ :80 → :11434    │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │ Gateway/Route   │
              │ text.example.au │
              └─────────────────┘
```

## Catalog Leaf Example

```yaml
workloadType: OLLAMA_INFERENCE_LOAD
serviceName: ollama-phi
serviceCatalog: ml-inference
namespace: ml-workloads
environment: dev
model: "phi:latest"
gpu:
  count: 1
ingress:
  enabled: true
  host: text.hypermedia.au
container:
  replicas: 1
  resources:
    requests:
      cpu: "500m"
      memory: "2Gi"
    limits:
      cpu: "2"
      memory: "4Gi"
```

## Known Limitations / Technical Debt

1. **Init container hack** - Starting `ollama serve` in background, sleeping, then pulling is fragile. Should use proper readiness checking or a dedicated model-pull image.

2. **emptyDir volume** - Model is re-downloaded on every pod restart. For larger models this is wasteful and slow.

3. **Single model only** - Current design pulls one model at startup. No support for multiple models or hot-swapping.

4. **No model versioning/pinning** - Ollama tags can be mutable. No guarantee of reproducibility.

5. **No health check for model loaded** - Health endpoint `/` only confirms Ollama is running, not that model is loaded and ready.

## Next Steps

### Short Term
- [ ] Replace sleep hack with proper health polling in init container
- [ ] Add PVC option for model persistence across restarts
- [ ] Add readiness probe that checks model is actually loaded

### Medium Term
- [ ] Support multiple models (comma-separated or array in values)
- [ ] Add Modelfile support for custom system prompts / parameters
- [ ] Consider sidecar pattern for model management
- [ ] Add resource presets (small/medium/large) based on model size

### Long Term
- [ ] Model registry integration (pull from internal registry vs Ollama hub)
- [ ] Autoscaling based on request queue depth
- [ ] Multi-node inference for larger models
- [ ] Revisit TGI chart when PyTorch adds sm_120 support

## Files Created

```
charts/ollama-inference-load/
├── Chart.yaml
├── values.yaml
├── values.schema.json
└── templates/
    ├── deployment.yaml
    ├── service.yaml
    ├── gateway.yaml
    ├── httproute.yaml
    └── ingressCert.yaml

src/workloadChartValues/
└── ollamaInferenceLoad.ts

.cat/backstage/
└── ollama-inference-load.catalog-info.yaml
```

## Test Results

```json
{
  "model": "phi",
  "response": "the blue color of the sky is caused by the scattering of sunlight...",
  "done": true,
  "eval_count": 132,
  "eval_duration": 420462721
}
```

~132 tokens in ~420ms = **~314 tokens/sec** on RTX 5070 Ti with phi model.

---

*Created: 2025-12-04*
*Status: POC Complete*

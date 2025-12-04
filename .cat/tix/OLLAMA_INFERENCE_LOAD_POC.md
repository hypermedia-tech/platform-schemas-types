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

## The Bigger Picture: Artifact + Config = Deployment

### What This POC Really Proves

This isn't just about running Ollama. It's proof that **our catalog architecture doesn't care what the artifact is**. If you have:

1. A container image (the artifact)
2. Some configuration (the values file)
3. A chart that knows how to wire them together (the leaf)

...then the catalog can deploy it. LLM inference is just the latest example. The same pattern works for:

- Web services (BASIC_CONTAINER_LOAD)
- Stateful workloads (STATEFUL_CONTAINER_LOAD)
- Canary deployments (BASIC_CONTAINER_ROLLOUT)
- ML inference - PyTorch stack (ML_INFERENCE_LOAD)
- ML inference - llama.cpp stack (OLLAMA_INFERENCE_LOAD)
- Anything else with a container and config

The catalog system is **artifact-agnostic**. The charts are just adapters that translate declarative config into Kubernetes resources.

### Structural Similarity Across Workload Types

Compare the catalog leaves across chart types:

| Field | BASIC_CONTAINER_LOAD | ML_INFERENCE_LOAD | OLLAMA_INFERENCE_LOAD |
|-------|---------------------|-------------------|----------------------|
| `workloadType` | ✓ | ✓ | ✓ |
| `serviceName` | ✓ | ✓ | ✓ |
| `serviceCatalog` | ✓ | ✓ | ✓ |
| `namespace` | ✓ | ✓ | ✓ |
| `environment` | ✓ | ✓ | ✓ |
| `container.image` | ✓ | ✓ | ✓ |
| `container.resources` | ✓ | ✓ | ✓ |
| `container.replicas` | ✓ | ✓ | ✓ |
| `container.environment` | ✓ | ✓ | ✓ |
| `container.secrets` | ✓ | ✓ | - |
| `ingress` | ✓ | ✓ | ✓ |
| `model` | - | ✓ (object) | ✓ (string) |
| `gpu` | - | ✓ | ✓ |

~80% of the schema is identical. The ML charts add `model` and `gpu`. That's it.

This structural consistency is the architecture working as designed:
- **Common concerns** (networking, resources, secrets) are handled the same way everywhere
- **Domain-specific concerns** (model config, GPU allocation) are additive, not different

### What This Means For The Platform

We can onboard new workload types quickly because:

1. **Copy-paste-modify** - New chart starts from existing chart, change the domain-specific bits
2. **TypeScript schemas** - Type safety catches mismatches at development time, not deployment time
3. **Consistent UX** - Users learn the pattern once, apply it everywhere
4. **Backstage integration** - Every chart is discoverable and scaffoldable

This is why we're valuable before we have users: **the architecture is proven extensible**. Adding OLLAMA_INFERENCE_LOAD took hours, not weeks.

### Schema-Driven UI: The DevEx Multiplier

Here's where the architecture really pays off: **the TypeScript schemas don't just validate - they drive UI generation**.

The Backstage workload configuration pages use the `workloadType` discriminator to dynamically render the right React components:

```
workloadType: "BASIC_CONTAINER_LOAD"     → Shows: container config, ingress, resources
workloadType: "BASIC_CONTAINER_ROLLOUT"  → Shows: above + rollout strategy panel
workloadType: "OLLAMA_INFERENCE_LOAD"    → Shows: above + model selector, GPU config
```

The schema fields map directly to UI elements:

| Schema Field | UI Component |
|--------------|--------------|
| `model: string` | Model input field (with Ollama model suggestions) |
| `gpu.count: number` | GPU count slider/input |
| `container.resources` | Resource allocation panel |
| `ingress.enabled` | Toggle switch |

When `OLLAMA_INFERENCE_LOAD` lands in production:
1. The TypeScript interface already defines `model` and `gpu`
2. Backstage reads the schema
3. ~2 hours of wiring to add model-specific UI components
4. Users get a **purpose-built configuration screen** for ML inference

No JSON editing. No documentation lookups. The UI guides them through exactly what this workload type needs.

**This is the devex flywheel:**
```
New workload type
       ↓
TypeScript schema with explicit fields
       ↓
JSON Schema for validation
       ↓
Backstage reads schema
       ↓
UI components render dynamically
       ↓
Users configure via guided UI
       ↓
Validated YAML lands in catalog
       ↓
ArgoCD deploys
```

The explicit fields we debated earlier (`model` vs generic `environment`) aren't just about validation - they're **UI affordances**. A `model` field becomes a model picker. A `gpu.count` field becomes a slider with sane defaults. Generic environment arrays become... a generic key-value editor.

This is why the "specific fields vs generic environment" decision matters more than it first appears. Every explicit field is a UI component waiting to be built. Every generic environment entry is friction for the user.

---

## Design Discussion: Specific Fields vs Generic Environment

The `model` field in OLLAMA_INFERENCE_LOAD raises an architectural question: should workload-specific config be explicit schema fields, or should we push everything through `container.environment` and `container.secrets`?

### Case For Specific Fields (Current Approach)

**Discoverability** - When a user looks at the schema, they see `model: string` and immediately understand what's needed. Compare:

```yaml
# Explicit (current)
model: "phi:latest"

# Generic alternative
container:
  environment:
    - name: OLLAMA_MODEL
      value: "phi:latest"
```

The explicit version is self-documenting. The generic version requires documentation to explain that `OLLAMA_MODEL` is required and what it does.

**Validation** - TypeScript interfaces and JSON schemas can enforce required fields, valid types, and relationships. With generic environment arrays, validation is limited to "is this an array of name/value pairs?"

**Abstraction** - The chart can translate high-level intent into low-level config. `model: "phi"` becomes an init container, a volume mount, and a pull command. Users don't need to understand the implementation.

**IDE Support** - Explicit fields get autocomplete, type hints, and inline documentation. Generic arrays don't.

**Evolution** - When the chart changes implementation (e.g., switching from init container to sidecar), the interface stays stable. Users don't need to update their values files.

### Case For Generic Environment/Secrets (Alternative Approach)

**Flexibility** - Any new feature the underlying runtime supports is immediately available. No chart changes needed to pass a new flag.

```yaml
# If Ollama adds OLLAMA_FLASH_ATTENTION tomorrow:
container:
  environment:
    - name: OLLAMA_FLASH_ATTENTION
      value: "true"
```

With explicit fields, this requires a chart update, TypeScript interface change, JSON schema update, and release.

**Reduced Chart Proliferation** - A generic "GPU container" chart could deploy TGI, Ollama, vLLM, or anything else. The runtime-specific config lives in environment variables, not chart structure.

**Simpler Charts** - Charts become pure infrastructure concerns (networking, volumes, GPU allocation). Application config is passthrough.

**Faster Iteration** - Platform team doesn't bottleneck application teams. They can experiment with new runtime flags without waiting for chart releases.

**Consistency With Twelve-Factor** - Environment variables are the standard way to configure containers. Specific fields are a layer on top that may not match how users think about their applications.

### The Tension

This is fundamentally a trade-off between:

| Explicit Fields | Generic Environment |
|-----------------|---------------------|
| Better UX for known use cases | Better flexibility for unknown use cases |
| Platform team controls interface | Application team controls config |
| Safer (validated) | More powerful (unrestricted) |
| Requires releases for new features | Zero-friction feature adoption |
| Opinionated | Unopinionated |

### Possible Middle Ground

1. **Required fields explicit, optional fields generic** - `model` is explicit because it's required. Runtime tuning flags go through `container.environment`.

2. **Tiered charts** - `OLLAMA_INFERENCE_LOAD` for guided experience, `GPU_CONTAINER_LOAD` for power users who want raw control.

3. **Escape hatch pattern** - Explicit fields for common cases, but `container.environment` always available for overrides and edge cases. (This is what we have now.)

### Where We Are Today

Current charts use hybrid approach:
- Explicit fields for domain-specific required config (`model`, `gpu.count`)
- Generic `container.environment` for optional/advanced config
- Generic `container.secrets` for sensitive values from Vault

This seems reasonable for now. The risk is scope creep - every new feature request becoming an explicit field until the schema is bloated.

Recommendation: **Hold the line on explicit fields**. Only promote to explicit if:
1. It's required for the workload to function
2. It needs validation beyond "string exists"
3. It abstracts implementation complexity users shouldn't see

Everything else stays in `container.environment`.

---

*Created: 2025-12-04*
*Status: POC Complete*

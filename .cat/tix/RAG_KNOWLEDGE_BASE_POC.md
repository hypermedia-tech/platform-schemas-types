# RAG Knowledge Base POC

## Summary

Deploy a RAG-powered internal knowledge base as a showcase of catalog composability. A Go microservice (scaffolded from the existing Go+CouchDB template) sits in front of the already-deployed Ollama inference service. Users ask questions via REST API, the service retrieves relevant JSON documents from CouchDB, constructs a context-augmented prompt, and returns an LLM-grounded answer.

No new chart types. Pure composition of existing catalog patterns.

## Architecture

```
                      ┌──────────────────────────────────┐
                      │  User / Curl / Backstage UI      │
                      └──────────────┬───────────────────┘
                                     │ POST /v1/ask
                                     ▼
                      ┌──────────────────────────────────┐
                      │  rag-kb-service                   │
                      │  (Go, ports & adapters)           │
                      │  chart: basic-container-load      │
                      │                                   │
                      │  ┌────────────┐  ┌─────────────┐ │
                      │  │ Retriever  │  │ LLM Client  │ │
                      │  │ (port)     │  │ (port)      │ │
                      │  └─────┬──────┘  └──────┬──────┘ │
                      └────────┼────────────────┼────────┘
                               │                │
                  ┌────────────▼───┐    ┌───────▼──────────┐
                  │  CouchDB       │    │  Ollama          │
                  │  (JSON docs    │    │  (inference)     │
                  │   about our    │    │  chart: ollama-  │
                  │   services)    │    │  inference-load  │
                  └────────────────┘    └──────────────────┘
```

## Catalog Leaves (3 entries, one catalog)

1. **Ollama** -- existing `ollama-inference-load` leaf (already deployed, e.g. `gitops-text-gen-service`)
2. **CouchDB** -- existing CouchDB pattern from the Go template's infra
3. **rag-kb-service** -- new `basic-container-load` leaf for the Go API

All three deployed into the same namespace so they can reach each other via cluster DNS.

## Data Model

CouchDB documents -- manually curated JSON records describing platform services. Example:

```json
{
  "_id": "svc:gitops-text-gen-service",
  "type": "service",
  "name": "gitops-text-gen-service",
  "workloadType": "OLLAMA_INFERENCE_LOAD",
  "description": "LLM inference service running phi model on GPU via Ollama runtime",
  "catalog": "gitops-catalog",
  "namespace": "gitops-services",
  "environment": "dev",
  "endpoints": ["/api/generate", "/api/chat", "/v1/chat/completions"],
  "dependencies": [],
  "owner": "platform-team",
  "tags": ["ml", "inference", "gpu", "ollama"],
  "notes": "Deployed on RTX 5070 Ti. ~314 tokens/sec with phi model."
}
```

Documents are inserted manually (or via a seed script). This is a curated, small dataset -- no bulk ingestion pipeline needed for the POC.

## API Surface

### `POST /v1/ask`

```json
// Request
{
  "question": "What services run on GPU?"
}

// Response
{
  "answer": "The gitops-text-gen-service runs on GPU. It's an Ollama-based inference service running the phi model on an RTX 5070 Ti in the gitops-services namespace.",
  "sources": ["svc:gitops-text-gen-service"],
  "model": "phi"
}
```

### `GET /v1/health`

Standard health check (liveness/readiness target).

## Retrieval Strategy

### Phase 1 (this POC): Mango query keyword matching

1. Extract keywords from the user question (simple: split + stop-word removal in Go)
2. CouchDB Mango query using `$or` + `$regex` across `name`, `description`, `tags`, `notes` fields
3. Return top N matching documents as context

Design the retriever as a **port** (interface) in the Go service so the implementation can be swapped later.

```go
type Retriever interface {
    Retrieve(ctx context.Context, query string, limit int) ([]Document, error)
}
```

### Phase 2 (future): Vector similarity

Swap the Mango-based retriever for an embedding-based one. Options:
- Ollama's `/api/embeddings` endpoint to generate vectors
- Store vectors in a dedicated index (PG+pgvector, or a lightweight vector store)
- Same interface, different implementation -- no API changes

## Go Service Internal Structure (ports & adapters)

The scaffolded template already provides the structure. The domain-specific pieces we add:

```
internal/
  domain/
    ask.go              # AskQuestion use case
    document.go         # Document model
  ports/
    retriever.go        # Retriever interface
    llm.go              # LLMClient interface
  adapters/
    couchretriever/     # CouchDB Mango-based retriever
    ollamaclient/       # HTTP client for Ollama /api/generate
  handlers/
    ask_handler.go      # POST /v1/ask
    health_handler.go   # GET /v1/health (likely already scaffolded)
```

## Prompt Construction

Simple template approach:

```
You are a helpful assistant that answers questions about our platform services.
Use ONLY the following context to answer. If the context doesn't contain
the answer, say "I don't have information about that."

Context:
---
{retrieved documents as formatted text}
---

Question: {user question}
```

## Configuration (values leaf for rag-kb-service)

```yaml
workloadType: BASIC_CONTAINER_LOAD
serviceName: rag-kb-service
serviceCatalog: gitops-catalog
namespace: gitops-services
environment: dev
ingress:
  enabled: true
  host: 'rag.hypermedia.au'
container:
  image:
    repository: ghcr.io/hypermedia-tech/rag-kb-service
    tag: latest
  replicas: 1
  containerPorts:
    - portName: "http"
      portNumber: 8080
      protocol: "TCP"
      servicePort: 80
  resources:
    requests:
      cpu: "100m"
      memory: "128Mi"
    limits:
      cpu: "500m"
      memory: "256Mi"
  environment:
    - name: OLLAMA_URL
      value: "http://gitops-text-gen-service.gitops-services.svc.cluster.local"
    - name: COUCHDB_URL
      value: "http://couchdb.gitops-services.svc.cluster.local:5984"
    - name: COUCHDB_DATABASE
      value: "platform-kb"
    - name: OLLAMA_MODEL
      value: "phi"
```

Note: CouchDB credentials go through `container.secrets` / vault, not environment.

## What This Proves

1. **Catalog composability** -- three independent leaves (Ollama, CouchDB, Go API) composed into a working system via the same catalog
2. **Chart reuse** -- the Go API uses `basic-container-load` with zero chart changes
3. **Internal service mesh** -- services discover each other via cluster DNS, no special wiring
4. **Practical AI use case** -- "ask questions about our platform" is immediately useful, not just a tech demo
5. **Ports & adapters pays off** -- retrieval strategy is swappable without touching the API or LLM integration

## Known Limitations (acceptable for POC)

- Keyword retrieval is naive -- good enough for ~20-50 curated docs, won't scale to thousands
- No streaming -- response waits for full LLM generation (Ollama supports streaming, can add later)
- No auth on the API -- internal cluster access only via ingress
- No conversation memory -- each request is stateless
- Manual document seeding -- no ingest pipeline

## Tickets

See individual ticket files in this directory:
- `RAG_KB_01_scaffold_go_service.md`
- `RAG_KB_02_retriever_port_and_couch_adapter.md`
- `RAG_KB_03_llm_port_and_ollama_adapter.md`
- `RAG_KB_04_ask_usecase_and_handler.md`
- `RAG_KB_05_prompt_template.md`
- `RAG_KB_06_seed_couchdb_data.md`
- `RAG_KB_07_catalog_leaf.md`
- `RAG_KB_08_deploy_and_test.md`

---

*Created: 2026-02-11*
*Status: Draft*

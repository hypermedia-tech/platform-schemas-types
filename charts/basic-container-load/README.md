# basic-container-load

Base chart for a stateless container service: a Deployment and Service, secrets pulled from Vault through External Secrets, optional HTTPS exposure on an Istio Gateway, and an optional CloudNativePG Postgres database.

Values are validated against `values.schema.json` (unknown keys are rejected) and typed as `BasicContainerLoadSchema` in the npm package.

## What it renders

| Resource | Name | When |
|---|---|---|
| Deployment | `<serviceName>` | always |
| Service (NodePort) | `<serviceName>` | always |
| ServiceAccount | `<serviceName>-external-secrets` | always |
| ExternalSecret → image pull Secret | `<serviceName>-ghcr-docker-config` | always |
| ExternalSecret → app Secret | `<serviceName>-secrets` | `container.secrets` is non-empty |
| Gateway, HTTPRoute, Certificate | `<serviceName>-gateway`, `-http-route`, `-tls-cert` | `ingress.enabled` |
| CNPG Cluster, RoleBinding, 2 ExternalSecrets | `<serviceName>-db-cluster`, … | `postgres.enabled` |

## How it works

### Container

`container.image`, `containerPorts`, `resources`, probes and `replicas` map straight onto the Deployment. Each entry in `containerPorts` becomes a container port and a Service port (`servicePort` → `portNumber`).

- `container.environment` — plain env vars (`name` / `value`).
- `container.secrets` — env vars from Vault. Each entry reads `property: value` at `vaultPath` into the `<serviceName>-secrets` Secret under `secretKey`, and is exposed as env var `name`.
- `basicMonitoring.enabled` adds Prometheus scrape annotations (port `15020`, `/stats/prometheus`).

### Secrets

All ExternalSecrets use the ClusterSecretStore named in `container.secretStore.name` (default `vault-backend`) and refresh every `container.secretRefreshInterval` (default `24h`).

The image pull secret always comes from Vault `shared/ghcr/dockerconfigjson` (property `dockerconfigjson`), so that path must exist even for public images.

### Exposure

With `ingress.enabled: true` and `ingress.host` set, the chart creates:

- a Gateway on the `istio` GatewayClass with one HTTPS listener for `ingress.host`, terminating TLS with `<serviceName>-tls-cert`;
- a Certificate for `ingress.host` from the `letsencrypt-prod` ClusterIssuer;
- an HTTPRoute sending `/` to the Service on `service.port` (default `80`). That port must match a `servicePort` in `containerPorts`.

If ExternalDNS watches `gateway-httproute`, the DNS record for `ingress.host` is created automatically.

### Postgres

With `postgres.enabled: true` the chart creates a CloudNativePG `Cluster` named `<serviceName>-db-cluster`:

- database `postgres.dbname`, owned by `postgres.owner`;
- `postgres.instances` instances, Postgres major `postgres.pgVersionMajor` from the `postgresql` ClusterImageCatalog;
- storage `postgres.storageSize` on `postgres.storageClass`;
- a RoleBinding giving the cluster's ServiceAccount (`<dbname>-sa`) the `cloudnative-pg` ClusterRole.

Credentials come from Vault through two ExternalSecrets (type `kubernetes.io/basic-auth`, keys `username` / `password`):

| Secret | Vault path | Used for |
|---|---|---|
| `<dbname>-db-secret` | `secret/shared/<serviceName>/postgres/credentials` | app owner; `username` must equal `postgres.owner` |
| `<dbname>-db-su-secret` | `secret/shared/<serviceName>/postgres/su-credentials` | superuser |

The chart doesn't wire the database into the container. Pass the connection in yourself: CNPG exposes `<serviceName>-db-cluster-rw` (read-write), `-ro` and `-r` Services on port 5432.

```yaml
container:
  environment:
    - name: POSTGRES_HOST
      value: portal-db-cluster-rw.my-namespace.svc.cluster.local
    - name: POSTGRES_PORT
      value: "5432"
    - name: POSTGRES_USER
      value: backstage
  secrets:
    - name: POSTGRES_PASSWORD
      secretKey: postgres-password
      vaultPath: secret/shared/portal/postgres/credentials
```

`container.secrets` reads the `value` property, so store the password there too, or point `vaultPath` at a path that has one.

## Example

```yaml
workloadType: BASIC_CONTAINER_LOAD
serviceName: portal
serviceCatalog: my-catalog
namespace: my-namespace
environment: core
ingress:
  enabled: true
  host: portal.example.com
container:
  secretStore:
    name: vault-backend
  replicas: 1
  image:
    repository: ghcr.io/my-org/portal
    tag: 1.0.0
  containerPorts:
    - portName: http
      portNumber: 7007
      protocol: TCP
      servicePort: 80
  resources:
    requests: { cpu: "250m", memory: "512Mi" }
    limits: { cpu: "1", memory: "1Gi" }
  livenessProbe:
    enabled: true
    type: http
    path: /healthcheck
    port: 7007
    scheme: HTTP
    initialDelaySeconds: 10
    timeoutSeconds: 10
    periodSeconds: 10
    successThreshold: 1
    failureThreshold: 3
  readinessProbe:
    enabled: false
  hpa:
    enabled: false
postgres:
  enabled: true
  dbname: backstage
  owner: backstage
  pgVersionMajor: 16
  storageSize: 1Gi
  storageClass: nfs-db-storage
```

## Prerequisites

- External Secrets with the ClusterSecretStore named in `container.secretStore.name`, and the Vault paths above.
- For `ingress`: Istio with Gateway API, cert-manager with a `letsencrypt-prod` ClusterIssuer.
- For `postgres`: the CloudNativePG operator, its `cloudnative-pg` ClusterRole, and a `postgresql` ClusterImageCatalog.

## Gotchas

- **Keep `namespace` equal to the release namespace.** The Deployment, Service and app secrets use `.Values.namespace`; the Gateway, route, certificate and Postgres resources use the Helm release namespace.
- **Probes only support `type: http`.** Any other type renders a probe with no handler.
- **`container.hpa.enabled` only drops `replicas` from the Deployment.** This chart doesn't render a HorizontalPodAutoscaler.
- **`serviceAccount`** sets the pod's ServiceAccount. The `<serviceName>-external-secrets` ServiceAccount is always created but only used if you name it here.

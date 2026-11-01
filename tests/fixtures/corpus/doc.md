# Deployment guide

## Prerequisites

- Node.js 26 or newer
- Access to the `acme-staging` cluster (`kubectl config use-context acme-staging`)
- A valid **deploy token** in your keychain

## Steps

1. Run `pnpm build` and confirm the output in `dist/`.
2. Tag the image: `docker tag acme/orders:latest acme/orders:$(git rev-parse --short HEAD)`.
3. Apply manifests with `kubectl apply -f deploy/staging/`.

> **Note:** never apply production manifests from a laptop. Use the release pipeline.

| Environment | URL | Approver |
|---|---|---|
| staging | https://staging.acme.example | any maintainer |
| production | https://acme.example | release manager |

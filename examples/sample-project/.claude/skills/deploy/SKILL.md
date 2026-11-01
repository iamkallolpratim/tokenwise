---
name: deploy
description: Deploy the Acme Orders service to staging. Use when asked to deploy or ship to staging.
---

1. Confirm the branch is merged to `main` and CI is green.
2. Run `pnpm deploy:staging`.
3. Check `https://staging.acme.example/v2/health` returns 200.
4. Never deploy to production from this skill.

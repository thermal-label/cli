# Blockers

Items that could not be completed autonomously and need operator action.

## B1 — Git remote not configured

**Status:** deferred.

The repo at `/home/mannes/thermal-label/cli` has no `origin` remote.
The implementation plan specifies "commit + push" at each step, but
`git push` requires a configured remote and credentials. Commits are
made locally per step so the history cleanly maps to the plan.

**To unblock:**

```bash
cd /home/mannes/thermal-label/cli
git remote add origin git@github.com:thermal-label/cli.git
git push -u origin main
```

## B2 — npm publish (Step 9, operator approval required)

**Status:** deferred.

Publishing to npm is an external, hard-to-reverse action. Publishing is
not part of the plan's gate checks, but the package is publish-ready:
`release.yml` is configured for trusted OIDC publishing on `v*` tags.

**To unblock:**

- Option A (recommended): push a `v0.1.0` git tag. The `release.yml`
  workflow publishes via OIDC trusted publishing — no credentials
  needed locally.
- Option B: `pnpm publish --access public` from the repo root after
  `pnpm build`. Requires `npm login` with publish rights on the
  `thermal-label-cli` package.

## B3 — Post-ship cleanup (not part of this package)

PLAN §11 lists post-ship tasks that are **out of scope** for the CLI
implementation but recorded here so they aren't lost:

- Unpublish per-driver CLIs: `@thermal-label/labelmanager-cli`,
  `@thermal-label/labelwriter-cli`, `@thermal-label/brother-ql-cli`.
- Retrofit drivers (`*-node` packages) to implement `PrinterDiscovery`
  and export a `discovery` instance (named export or via default).

Until the drivers are retrofitted, this CLI finds zero printers when
run against installed drivers. That is expected — see PLAN §4.6.

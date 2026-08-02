# Agent and contributor notes

Working notes for anyone — human or tooling — making changes to this repository.

## Non-negotiable

1. **Authorship.** Every commit uses the project owner identity: `Arslan Vuzmal Lone <arslanvuzmallone@gmail.com>`. No co-author trailer, no automated-assistant identity, no session link. See `docs/AUTHORSHIP_AUDIT.md`.
2. **Secrets.** `.env` and `.env.local` are gitignored and must stay that way. Never commit a real credential, and never print one in output.
3. **Honesty.** Estimates are labelled as estimates. Comparisons are not benchmarks. Demo models are marked fictional. Limitations are documented, not hidden.

## Before committing

```bash
npm run verify
npm run test:integration
npm run test:security
git diff --check
git status --short
```

## Architectural invariants

- **One execution path.** The API, playground and demo all call `runCompletion`. Do not add a parallel path.
- **Workspace scoping.** Every tenant-scoped query carries `workspaceId`. A foreign record must be indistinguishable from a missing one.
- **Server-side authorisation.** Check permission before doing work. Hiding a control is presentation, not access control.
- **Classification before retry.** Never add a blanket retry. Add a category with a stated rationale.
- **`SAFETY_REFUSAL` does not fall back.** This is deliberate. Do not "fix" it.
- **Metadata-only by default.** Do not store prompt or response content without an explicit workspace opt-in.

## Version pins that look wrong but are not

- **TypeScript 6.0.3, not 7.x** — `typescript-eslint` peer-caps at `<6.1.0`; upgrading disables linting.
- **ESLint 9, not 10** — `eslint-plugin-react` calls `context.getFilename()`, removed in ESLint 10.

Both are recorded in `docs/DECISIONS.md`. Check that file before "upgrading" either.

## Database

- Local PostgreSQL runs on **port 5435** (`docker compose up -d db`) to avoid colliding with other local instances.
- Use `prisma migrate deploy` in deployment. **Never** `migrate reset` against anything but a local throwaway database.
- The demo seed refuses to run when `DEMO_MODE=false`; `demo:reset` refuses any workspace not flagged `isDemoWorkspace`.

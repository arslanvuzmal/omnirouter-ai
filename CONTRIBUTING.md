# Contributing

This is a portfolio project by Arslan Vuzmal Lone. Issues and observations are welcome; large feature contributions are not the point of the repository.

## Setup

```bash
npm install
cp .env.example .env.local   # then generate the three secrets
npm run db:up
npm run db:deploy
npx tsx prisma/seed/index.ts
npm run dev
```

## Before opening a pull request

```bash
npm run verify            # format, lint, typecheck, unit tests, build
npm run test:integration  # needs the database
npm run test:security     # needs the database
```

All of these must pass. CI runs the same set plus the demo verification.

## Conventions

- **Commits:** conventional prefixes (`feat:`, `fix:`, `chore:`, `test:`, `docs:`). Explain _why_ in the body, not just what.
- **Comments:** explain reasoning a reader could not infer from the code. Do not narrate syntax.
- **Types:** strict. No `any`. `noUncheckedIndexedAccess` is on.
- **Validation:** every external input crosses a Zod schema.
- **Queries:** every tenant-scoped query carries `workspaceId`.
- **Secrets:** never logged, never returned to a client, never written into an audit record.

## Honesty rules

These matter more than style:

- Estimated figures are labelled as estimates.
- Comparisons are demonstrations, never benchmarks.
- No strategy claims to find the "best" model.
- Demo models are marked fictional wherever they appear.
- Limitations go in `docs/KNOWN_LIMITATIONS.md`, not out of sight.

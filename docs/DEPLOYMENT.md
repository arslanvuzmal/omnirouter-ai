# Deployment

**Project:** OmniRouter AI · **Author:** Arslan Vuzmal Lone

GitHub hosts the source. Vercel runs the application. Supabase provides PostgreSQL.

---

## 1. Database — Supabase

Create a project, then take **both** connection strings from Project settings → Database:

| Variable       | Which string                              | Why                                                                                                            |
| -------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL` | **Pooled** (port 6543, `?pgbouncer=true`) | Serverless functions open many short-lived connections; the pooler is what keeps that from exhausting Postgres |
| `DIRECT_URL`   | **Direct** (port 5432)                    | The pooler cannot run DDL, so Prisma Migrate needs a direct connection                                         |

Apply the schema:

```bash
DIRECT_URL="postgresql://…:5432/postgres" npx prisma migrate deploy
```

Use `migrate deploy`, never `migrate dev` and **never** `migrate reset` — reset drops the database.

---

## 2. Application — Vercel

```bash
vercel link
vercel --prod
```

Or connect the GitHub repository in the Vercel dashboard for deployment on push.

### Environment variables

Set in Project settings → Environment variables:

| Variable                | Value                                                           |
| ----------------------- | --------------------------------------------------------------- |
| `DATABASE_URL`          | Supabase pooled connection                                      |
| `DIRECT_URL`            | Supabase direct connection                                      |
| `AUTH_SECRET`           | `openssl rand -base64 32`                                       |
| `ENCRYPTION_KEY`        | `openssl rand -base64 32` — must decode to **exactly** 32 bytes |
| `INTERNAL_API_SECRET`   | `openssl rand -base64 32`                                       |
| `APP_URL`               | The deployment URL                                              |
| `DEMO_MODE`             | `true` for the portfolio deployment                             |
| `NEXT_PUBLIC_DEMO_MODE` | `true`                                                          |
| `DEMO_PASSWORD`         | Password for seeded demo accounts                               |

Optional provider keys — `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY`, `OLLAMA_BASE_URL`. **With none set, the platform remains fully functional through the deterministic demo provider.**

### Build

`package.json` runs `prisma generate && next build`. The Prisma client is generated at build time and is not committed.

---

## 3. Seed the demonstration

Run **once**, explicitly — never on every build:

```bash
DATABASE_URL="…" DIRECT_URL="…" DEMO_MODE=true npx tsx prisma/seed/index.ts
DATABASE_URL="…" npx tsx scripts/demo-traffic.ts     # optional: 30 days of traffic
DATABASE_URL="…" npx tsx scripts/demo-verify.ts      # confirm it worked
```

The seed refuses to run when `DEMO_MODE=false`. `demo:reset` additionally refuses to touch a workspace not flagged `isDemoWorkspace`.

---

## 4. Verify the deployment

- [ ] Landing page renders
- [ ] Sign in as `owner@omnirouter.demo`
- [ ] Dashboard shows non-zero statistics
- [ ] Playground runs a request
- [ ] Failure simulation produces a fallback
- [ ] Request trace shows every attempt
- [ ] Analytics render
- [ ] API keys are masked
- [ ] Sign in as `viewer@omnirouter.demo`; confirm running a request is refused
- [ ] Client Story Mode completes
- [ ] Mobile layout is usable
- [ ] No console errors
- [ ] Response headers include CSP and HSTS
- [ ] `/status` reports the database reachable

```bash
node scripts/route-check.mjs https://your-deployment
```

---

## 5. Notes

**Dynamic rendering.** Every dashboard route is `force-dynamic`; it reads live workspace data and cannot be prerendered. Only the marketing routes are static.

**Connection pooling.** If you see `too many connections`, `DATABASE_URL` is pointing at the direct connection rather than the pooler.

**Cold starts.** The first request after idle pays connection setup. Supabase's pooler reduces but does not remove this.

**Region.** Put the Vercel region near the Supabase region; a cross-continent database round trip dominates everything else in the latency figures.

---

## Continuous integration

`.github/workflows/ci.yml` runs on push and pull request against `main`: install, generate, migrate, format check, lint, typecheck, unit, integration, security, seed, demo verification, production build — against a PostgreSQL 16 service container.

CI uses throwaway credentials for a database created and destroyed within the job. No production secret is present in the workflow, and no workflow commits back to the repository.

---

## Obsidian export

Obsidian is a local markdown application, so the deployed site cannot write into
a vault. This export runs on your machine, reads whichever database
`DATABASE_URL` points at — local or Neon — and writes markdown into the vault.

```bash
npm run export:obsidian -- --vault "D:\Vault"
npm run export:obsidian -- --vault "D:\Vault" --limit 500
npm run export:obsidian -- --vault "D:\Vault" --only docs
```

It writes into a single `OmniRouter/` folder:

| Folder          | Contents                                                                               |
| --------------- | -------------------------------------------------------------------------------------- |
| `Requests/`     | One note per API, seed or traffic request — routing decision, every attempt, lifecycle |
| `Sessions/`     | Playground runs, kept separate as the exploratory record                               |
| `Docs/`         | The design documents, with relative links rewritten to `[[wikilinks]]`                 |
| `Analytics/`    | Rolling 30-day summary with a Dataview query to copy                                   |
| `OmniRouter.md` | Index linking the rest                                                                 |

Every note carries YAML frontmatter, so Dataview can query it:

````
```dataview
TABLE model, attempts, latency_ms, estimated_cost
FROM "OmniRouter/Requests"
WHERE fallback_used = true
SORT date DESC
```
````

**Safety.** The export writes only inside `<vault>/OmniRouter`, and every note it
creates carries a generation marker. Before replacing a folder's contents it
checks for that marker and **refuses to continue** if it finds a file it did not
write, so a hand-edited note is never silently destroyed. Nothing outside that
folder is touched.

**Content.** Under the default metadata-only logging mode, request notes contain
no prompt or response body — the platform does not store them. Notes say so
explicitly rather than leaving the omission unexplained.

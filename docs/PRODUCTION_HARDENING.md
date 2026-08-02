# Production hardening

**Project:** OmniRouter AI · **Author:** Arslan Vuzmal Lone

This project is a portfolio demonstration. What follows is the gap between it and a production deployment, ordered by consequence.

## Critical

**1. Move `ENCRYPTION_KEY` into a managed KMS.**
It currently comes from the environment. An attacker with both database access and the environment recovers every provider credential. Use AWS KMS, GCP KMS or Vault with envelope encryption.

**2. Build a key-rotation path.**
Rotating `ENCRYPTION_KEY` today orphans every existing ciphertext. This needs a key-version column and a routine that decrypts with the old key and re-encrypts with the new one.

**3. Add distributed rate limiting.**
Quotas query the database on every request. Under real load that is both a bottleneck and a race window. Put a sliding-window limiter (Upstash Redis or equivalent) in front of the database check.

## Important

**4. Schedule provider health checks.**
Health is recorded but never polled. A background job should probe each connection on an interval and update `healthState`, so reliability-aware routing scores on fresh signals rather than stale ones.

**5. Add alerting.**
A degraded provider is visible in the interface but notifies nobody. Wire health transitions and quota breaches to a webhook or paging service.

**6. Add a CSRF token.**
`sameSite=lax` plus server actions is adequate here; a token is stricter and worth having at scale.

**7. Ship audit logs to an immutable sink.**
Append-only _by construction_ is not append-only _by enforcement_ — direct database access can still modify rows.

**8. Roll up analytics.**
`getOverviewMetrics` samples up to 5,000 rows to compute percentiles. Beyond roughly a million requests per workspace, precompute into a rollup table or move to a columnar store.

## Recommended

**9. Validate each credential-backed adapter against its live provider.**
They are written against published contracts and exercised against recorded response shapes, not live paid endpoints.

**10. Add OpenTelemetry spans.**
So a customer can correlate a gateway trace with their own application trace.

**11. Move to a nonce-based CSP.**
`'unsafe-inline'` is currently required for styles by Tailwind's runtime and by Recharts.

**12. Move usage aggregation and audit writes onto a queue.**
Both happen inline today. Under load they belong off the request path.

**13. Set up backups and rehearse the restore.**
Supabase provides backups; the restore path should be exercised before it is needed.

## Configuration checklist

- [ ] `AUTH_SECRET` — 32+ random bytes, unique per environment
- [ ] `ENCRYPTION_KEY` — exactly 32 bytes base64, sourced from a KMS
- [ ] `DATABASE_URL` — pooled connection
- [ ] `DIRECT_URL` — unpooled, migrations only
- [ ] `DEMO_MODE=false` in production
- [ ] Provider keys held as platform secrets, never in the repository
- [ ] Release step runs `prisma migrate deploy` — **never** `migrate reset`
- [ ] Seed guarded behind an explicit command, never run on every build
- [ ] Security headers verified against the deployed response, not just the config

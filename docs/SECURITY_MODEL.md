# Security model

**Project:** OmniRouter AI
**Author:** Arslan Vuzmal Lone

This document states what the platform does, and — equally important — what it does not claim.

---

## Scope of the claim

OmniRouter is a portfolio project running a public demonstration deployment. It is **not** certified, audited, or penetration-tested by a third party, and it carries no compliance attestation. What follows is a description of implemented controls, not a guarantee of security.

The controls below are exercised by 23 automated security tests (`npm run test:security`), which is evidence that they behave as described — not proof that no vulnerability exists.

---

## 1. Authentication

### Passwords

scrypt from the Node standard library, chosen over argon2 because it needs no native compilation — which matters for CI and for Vercel's build image.

```
scrypt$16384$8$1$<base64 salt>$<base64 hash>
```

- Per-password random 16-byte salt: identical passwords produce different hashes.
- Cost parameters embedded in the stored value, so raising them later does not invalidate existing hashes.
- Verification is constant-time via `timingSafeEqual`.
- A malformed stored hash returns `false` rather than throwing.

### Sessions

Database-backed, deliberately not JWT:

| Property     | Implementation                                                                  |
| ------------ | ------------------------------------------------------------------------------- |
| Cookie       | Opaque 32-byte random token, `httpOnly`, `sameSite=lax`, `secure` in production |
| Storage      | Only the SHA-256 of the token — a database disclosure yields no usable session  |
| Revocation   | Immediate and server-side; a JWT cannot be recalled before expiry               |
| Lifetime     | 7 days, with `lastSeenAt` refreshed at most daily to avoid a write per request  |
| XSS exposure | Nothing in `localStorage`, so injected script cannot read the token             |

### Login throttling

Counters live on the user row rather than in memory, so the limit survives a restart and cannot be bypassed by rotating IP addresses. Five failures lock the account for fifteen minutes.

**Account enumeration is avoided:** a non-existent account still performs a password hash before failing, and every failure returns one generic message.

---

## 2. Authorisation

Five roles, enforced on the server before every mutation:

| Role        | Permissions | Notably cannot                           |
| ----------- | ----------- | ---------------------------------------- |
| `OWNER`     | 40          | —                                        |
| `ADMIN`     | 38          | Delete the workspace, transfer ownership |
| `DEVELOPER` | 17          | Create production keys, manage providers |
| `ANALYST`   | 12          | Access any credential                    |
| `VIEWER`    | 11          | Write anything                           |

Two properties are tested explicitly:

- **Hidden controls are not access control.** Every server action calls `requirePermission` before doing work, so a crafted request reaches the same check the UI reflects.
- **Privilege escalation is blocked.** A member may only assign a role strictly below their own, so an admin cannot mint another owner or promote themselves.

---

## 3. Tenant isolation

Every tenant-scoped query carries `workspaceId` alongside the record id:

```ts
await prisma.request.findFirst({ where: { id, workspaceId } });
```

A request belonging to another workspace returns `null` — **indistinguishable from one that does not exist**. Revealing that a record exists but is inaccessible would leak the presence of other tenants.

The membership is always re-read from the database. There is no code path in which a client-supplied workspace id is trusted.

---

## 4. Secrets

### Virtual API keys

```
omr_<env>_<24 url-safe random characters>
```

- Stored as SHA-256 only. The plaintext is returned once, at creation, and is unrecoverable afterwards — by an owner, from the database, or from the interface.
- The stored prefix is display-only; hashing it does not produce the stored hash.
- Scoped to one application **and** one environment, so a development key cannot address production.
- Revocation and expiry are checked before any work is performed.

**An unknown key and a malformed key return byte-identical rejections**, so the endpoint cannot be used to probe which keys exist. Revocation and expiry _are_ stated plainly — the caller already holds that key, so it reveals nothing, and a vague message there costs an integrator hours.

### Provider credentials

AES-256-GCM, stored as `base64(iv):base64(tag):base64(ciphertext)`.

- Random 12-byte IV per encryption: identical credentials are not identifiable as identical from the database.
- Authenticated encryption — a tampered ciphertext fails to decrypt rather than silently yielding wrong plaintext.
- `ENCRYPTION_KEY` is validated to be exactly 32 bytes at use, failing loudly on misconfiguration.
- A credential that cannot be decrypted is treated as absent, which surfaces as `AUTHENTICATION` and flags the connection for an administrator rather than failing obscurely.

Credentials are never returned to a browser, never logged, and never written into an audit record.

---

## 5. Input validation

Every external input crosses a Zod schema before reaching a query or a provider.

| Limit                  | Value   | Purpose                     |
| ---------------------- | ------- | --------------------------- |
| Body size              | 1 MB    | Rejected before parsing     |
| Messages per request   | 64      | Bounds work                 |
| Characters per message | 32,000  | Bounds a single field       |
| Total characters       | 200,000 | Bounds the aggregate        |
| Temperature            | 0–2     | Rejects out-of-range values |

Malformed JSON, unknown message roles and oversized payloads are rejected with a specific code and no stack trace.

---

## 6. Prompt injection

Message content is **never parsed for directives**. Routing reads persisted policy configuration; a prompt instructing the platform to change strategy, disable quotas or reveal a credential is treated as ordinary text.

This is asserted by a test that sends exactly such a prompt and confirms the strategy and selected model are unchanged.

The platform does not claim to prevent prompt injection _against the model_. That is a property of the model and the application's own prompt design, not of a gateway.

---

## 7. Error handling

Provider error text is never forwarded to a caller — it can echo prompt content, internal endpoints or account identifiers. Each of the eleven failure categories maps to a fixed, safe message and an appropriate HTTP status.

A test asserts that a failure message contains no connection string, no `sk-` prefixed token, and no `file.ts:line` stack frame.

---

## 8. Transport and headers

Applied to every response:

| Header                      | Value                                                               |
| --------------------------- | ------------------------------------------------------------------- |
| `Content-Security-Policy`   | `default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload`                      |
| `X-Frame-Options`           | `DENY`                                                              |
| `X-Content-Type-Options`    | `nosniff`                                                           |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`                                   |
| `Permissions-Policy`        | camera, microphone, geolocation all denied                          |

`'unsafe-inline'` is permitted for **styles** because Tailwind's runtime and Recharts inject inline style attributes. Script sources remain strict in production; `'unsafe-eval'` is allowed only in development, where the Next.js dev overlay requires it.

`X-Powered-By` is disabled.

---

## 9. Data retention

Default is `METADATA_ONLY`: counts, timings, cost, routing decisions and error categories are stored; **prompt and response bodies are not**.

| Mode                        | Stores                                           |
| --------------------------- | ------------------------------------------------ |
| `METADATA_ONLY` _(default)_ | Metadata only                                    |
| `REDACTED`                  | Truncated preview with sensitive patterns masked |
| `FULL_CONTENT`              | Complete prompts and responses — explicit opt-in |

IP addresses are stored only as a salted 32-character hash, sufficient to correlate activity from one source without retaining the address.

Detail: [`PRIVACY_MODEL.md`](PRIVACY_MODEL.md).

---

## 10. Demo deployment

The public deployment runs with `DEMO_MODE=true` and no provider credentials.

- The deterministic demo provider runs in-process; **no request leaves the deployment**.
- The demo workspace is flagged protected: destructive operations are refused server-side, because the data is shared between visitors.
- Demo accounts hold no real credentials and cannot reach a production system.
- The demo password is published deliberately — it guards nothing of value.

---

## What this project does not do

Stated plainly, because a portfolio project that implies more than it implements is worse than one that scopes itself honestly.

- **No third-party audit or penetration test.**
- **No compliance certification** — not SOC 2, ISO 27001, HIPAA or GDPR-certified.
- **No availability guarantee.** The status page reports what it can measure at request time and claims no uptime figure.
- **No secret-manager integration.** `ENCRYPTION_KEY` comes from the environment; a production deployment should use a managed KMS.
- **No key rotation mechanism** for `ENCRYPTION_KEY`. Rotating it today would orphan existing ciphertext.
- **No distributed rate limiting.** Quotas are enforced per request against the database; a high-throughput deployment needs Redis or an equivalent.
- **No CSRF token.** Mutations rely on `sameSite=lax` cookies and server actions. That is adequate for this deployment but a token is preferable at scale.
- **No content-safety filtering.** Safety refusals from a provider are surfaced and respected, but OmniRouter performs no classification of its own.

Hardening steps for a real deployment: [`PRODUCTION_HARDENING.md`](PRODUCTION_HARDENING.md).

---

## Reporting

This is a portfolio project without a formal disclosure process. Security observations can be raised as a GitHub issue on the repository.

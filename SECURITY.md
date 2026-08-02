# Security policy

## Scope

OmniRouter AI is a portfolio project running a public demonstration deployment. It is **not** third-party audited, penetration-tested or compliance-certified, and it carries no security guarantee.

The demonstration deployment holds no real provider credentials and no personal data beyond the fictional seeded workspace.

## Reporting

Security observations can be raised as a GitHub issue on this repository. Please do not include working exploit payloads against the live demonstration.

There is no formal disclosure timeline or bounty for this project.

## Implemented controls

| Area                 | Control                                                                   |
| -------------------- | ------------------------------------------------------------------------- |
| Passwords            | scrypt, per-password salt, embedded cost parameters                       |
| Sessions             | Database-backed, SHA-256 stored, `httpOnly` cookie, immediately revocable |
| API keys             | SHA-256 only; plaintext shown once and unrecoverable                      |
| Provider credentials | AES-256-GCM, random IV per encryption, authenticated                      |
| Authorisation        | Server-side RBAC before every mutation                                    |
| Tenant isolation     | Every query scoped by workspace                                           |
| Input validation     | Zod on every external input, with explicit size limits                    |
| Errors               | Provider text never forwarded; no stack traces in responses               |
| Headers              | CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`          |
| Retention            | Metadata-only logging by default                                          |
| Audit                | Append-only, sensitive values redacted                                    |

Full detail: [`docs/SECURITY_MODEL.md`](docs/SECURITY_MODEL.md) and [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md).

## Not claimed

- No third-party audit or penetration test
- No compliance certification (SOC 2, ISO 27001, HIPAA, GDPR)
- No availability or uptime guarantee
- No secret-manager integration — `ENCRYPTION_KEY` comes from the environment
- No key rotation path for `ENCRYPTION_KEY`
- No distributed rate limiting
- No content-safety classification

Hardening guidance for a real deployment: [`docs/PRODUCTION_HARDENING.md`](docs/PRODUCTION_HARDENING.md).

## Supported versions

The `main` branch is the only supported version.

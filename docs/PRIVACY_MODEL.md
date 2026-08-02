# Privacy model

**Project:** OmniRouter AI · **Author:** Arslan Vuzmal Lone

## Default posture

**`METADATA_ONLY`.** Prompt and response bodies are not stored unless a workspace explicitly opts in.

The default should be the one that retains the least personal data. A customer's prompts may contain their own users' data, and a platform that silently retains it creates an obligation nobody agreed to.

## Modes

| Mode                        | Stores                                                     | Intended use                              |
| --------------------------- | ---------------------------------------------------------- | ----------------------------------------- |
| `METADATA_ONLY` _(default)_ | Counts, timings, cost, routing decisions, error categories | Production                                |
| `REDACTED`                  | Truncated preview with sensitive patterns masked           | Debugging shape without retaining content |
| `FULL_CONTENT`              | Complete prompts and responses                             | Explicit opt-in only                      |

`FULL_CONTENT` changes what personal data the deployment holds, so it requires a deliberate workspace setting and carries a warning in the interface.

## Always stored

Token counts, latency, estimated cost, model and provider, error category, routing explanation, trace stages, correlation id, timestamps.

**None of this contains message content.** The routing explanation records model names, scores and rejection reasons — never the prompt that produced them.

## Never stored in plaintext

| Value                | Stored form                    |
| -------------------- | ------------------------------ |
| Passwords            | scrypt hash, per-password salt |
| Session tokens       | SHA-256                        |
| Virtual API keys     | SHA-256                        |
| Provider credentials | AES-256-GCM ciphertext         |
| IP addresses         | Salted 32-character hash       |

## IP handling

Addresses are hashed with the server secret and truncated to 32 characters. That correlates activity from one source — enough to detect a brute-force pattern — without retaining the address itself.

## Audit redaction

Before any state snapshot is written, keys matching a sensitive list (`password`, `apiKey`, `keyHash`, `credential`, `secret`, `token`, `databaseUrl`, `encryptionKey`, and others) are replaced with `[redacted]` — recursively, case-insensitively, to a depth of six.

This means rotating a credential cannot leave the old value sitting in the audit table.

## Deletion

Workspace deletion cascades to applications, environments, policies, keys, requests, attempts, usage, quotas, health checks, audit entries and scenarios. Demo accounts are removed explicitly, since they are workspace-independent.

## Demonstration deployment

Contains only fictional seeded data: an invented company, invented people, invented models. No real personal data and no real provider credentials.

## Not claimed

- **No GDPR certification.** The architecture supports data minimisation and cascading deletion, but no formal assessment has been performed.
- **No data-processing agreement.**
- **No configurable retention window.** Records persist until the workspace is deleted.
- **No self-service export or erasure endpoint.**

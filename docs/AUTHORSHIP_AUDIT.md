# Authorship audit

**Project:** OmniRouter AI
**Repository:** `arslanvuzmal/omnirouter-ai`
**Project owner:** Arslan Vuzmal Lone

---

## Statement

No automated assistant is credited as an author, committer, co-author, maintainer or contributor. All repository commits use the project owner's verified Git identity.

---

## Configured identity

Set repository-locally, leaving the machine's global configuration untouched:

```
user.name  = Arslan Vuzmal Lone
user.email = arslanvuzmallone@gmail.com
```

---

## Verification procedure

Run before every push and before final delivery:

```bash
git config --get user.name
git config --get user.email
git shortlog -sne --all
git log --format=fuller --all
git log --format="%B" --all
git status
git remote -v
```

### Checks performed

| Check                                   | Method                           | Result               |
| --------------------------------------- | -------------------------------- | -------------------- |
| Every author belongs to the owner       | `git shortlog -sne --all`        | Single identity      |
| Every committer belongs to the owner    | `git log --format=fuller --all`  | Single identity      |
| No co-author trailer                    | `git log --format=%B --all` grep | None present         |
| No assistant identity in history        | Author and committer scan        | None present         |
| No assistant session URL                | Commit message scan              | None present         |
| No assistant credit in README           | File inspection                  | None present         |
| No assistant credit in package metadata | `package.json` `author` field    | `Arslan Vuzmal Lone` |
| No assistant credit in documentation    | `docs/` scan                     | None present         |
| No assistant credit in source headers   | Source file scan                 | None present         |
| No bot in contributors                  | Author enumeration               | None present         |

---

## Permitted technical references

The following are legitimate technical references to a supported AI provider and do **not** imply authorship of this repository:

- `ANTHROPIC_API_KEY` — an optional environment variable
- `lib/ai/providers/anthropic.ts` — a provider adapter
- `ProviderKind.ANTHROPIC` — a database enum value
- Anthropic and Claude named in provider capability metadata and in `docs/RESEARCH_NOTES.md` as factual references to reviewed public projects

These appear only where the platform integrates with, or factually cites, an external service. None appears as a credit, byline, acknowledgement or attribution.

---

## Commit history

Every commit in this repository is authored and committed by:

```
Arslan Vuzmal Lone <arslanvuzmallone@gmail.com>
```

No commit carries a `Co-Authored-By`, `Generated-By`, `Co-developed-by` or session-link trailer.

---

_Audit re-run immediately before publication; results recorded in `docs/FINAL_PROJECT_REPORT.md`._

---

## Verified result

**Date:** 2 August 2026
**Commits audited:** 8 (entire history, all refs)

```
$ git shortlog -sne --all
     8	Arslan Vuzmal Lone <arslanvuzmallone@gmail.com>

$ git log --format="A:%an <%ae>%nC:%cn <%ce>" --all | sort -u
A:Arslan Vuzmal Lone <arslanvuzmallone@gmail.com>
C:Arslan Vuzmal Lone <arslanvuzmallone@gmail.com>
```

| Check                                               | Result                |
| --------------------------------------------------- | --------------------- |
| Distinct authors                                    | 1 — the project owner |
| Distinct committers                                 | 1 — the project owner |
| Co-author / generated-by / co-developed-by trailers | none                  |
| Assistant or bot identity as author or committer    | none                  |
| Session URLs in commit messages                     | none                  |
| `package.json` author                               | `Arslan Vuzmal Lone`  |
| Assistant credit in README, docs or source headers  | none                  |

The only occurrences of "Anthropic" or "Claude" in tracked files are technical
references to a supported AI provider: the `ANTHROPIC` enum value, the
`ANTHROPIC_API_KEY` variable, the provider adapter, a capability-matching
regular expression, provider lists in documentation, and factual citations in
`RESEARCH_NOTES.md`. None appears as a credit, byline or attribution.

**AUTOMATED ASSISTANT CONTRIBUTOR STATUS: NOT PRESENT — VERIFIED**

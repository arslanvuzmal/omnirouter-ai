# Shot list

**Project:** OmniRouter AI · **Owner:** Arslan Vuzmal Lone

Capture at 1280×769, 2× device scale. Chart animation is disabled in code, so no waiting for sweeps.

| #   | Route                      | Action                                   | Hold |
| --- | -------------------------- | ---------------------------------------- | ---- |
| 1   | `/`                        | Static, hero visible                     | 3 s  |
| 2   | `/`                        | Slow scroll to "What OmniRouter changes" | 4 s  |
| 3   | `/demo/story`              | Step 1 — application and environments    | 3 s  |
| 4   | `/demo/story`              | Step 2 — hover a rejection reason        | 5 s  |
| 5   | `/demo/story`              | Step 4 — the attempt strip appears       | 4 s  |
| 6   | `/demo/story`              | Step 5 — fallback succeeds               | 5 s  |
| 7   | `/dashboard/requests/[id]` | Scroll the lifecycle timeline            | 6 s  |
| 8   | `/dashboard/requests/[id]` | Routing decision panel, score breakdown  | 4 s  |
| 9   | `/demo/story`              | Step 6 — safety refusal                  | 4 s  |
| 10  | `/dashboard`               | Overview, statistics visible             | 3 s  |

## Setup

```bash
npx tsx scripts/demo-reset.ts
npx tsx prisma/seed/index.ts
npx tsx scripts/demo-traffic.ts   # 30 days of traffic
npm run dev
```

Sign in as `owner@omnirouter.demo`. Use a clean browser profile — no extensions, no bookmarks bar.

## Avoid on camera

- The address bar showing `localhost` (crop or use a deployed URL)
- Any environment variable or terminal with secrets
- Browser devtools
- The Next.js dev indicator in the corner

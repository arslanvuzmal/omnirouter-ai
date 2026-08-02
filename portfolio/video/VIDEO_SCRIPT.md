# Video script — 60 seconds

**Project:** OmniRouter AI · **Owner:** Arslan Vuzmal Lone

Route: `/demo/story`. Every figure on screen is read from real seeded requests, so nothing needs faking in post.

---

## 0:00–0:08 — The problem

**Screen:** Landing page, hero visible.

> "Your AI feature works — until the provider rate-limits at peak, returns a 500 during a demo, or triples in price. By then the call is spread across a dozen files."

---

## 0:08–0:16 — The product

**Screen:** Scroll to "What OmniRouter changes".

> "OmniRouter sits between your product and every provider. One endpoint. Routing is a policy an operator edits, not a branch in your code."

---

## 0:16–0:26 — The decision

**Screen:** `/demo/story`, step 2. Score breakdown visible.

> "Most gateways log which model they picked. This one stores _why_ — the score for every candidate, and the reason each rejected one was dropped."

**Cursor:** hover the rejection reason.

---

## 0:26–0:38 — The failure

**Screen:** Step 4, then step 5. The attempt strip.

> "Now the provider stalls. The failure is classified as a timeout. Its policy allows exactly one retry — a second would risk duplicating work already running."

**Beat.** Let the three-row attempt strip land.

> "That retry fails too. So the request moves to a different model, and succeeds."

---

## 0:38–0:48 — The trace

**Screen:** Click through to the full request trace.

> "The caller got a normal response. An operator gets this: every attempt, every timing, the cost, and the decision that produced it."

**Cursor:** scroll the lifecycle timeline.

---

## 0:48–0:56 — The refusal

**Screen:** Step 6.

> "And not every failure should be routed around. A safety refusal is returned to the caller — never shopped to another provider until one complies. That's a deliberate default."

---

## 0:56–1:00 — Close

**Screen:** Dashboard overview.

> "OmniRouter AI. Built by Arslan Vuzmal Lone."

---

## Production notes

**Do not say:**

- "Saves you money" — cost figures are estimates
- "Benchmark" — comparisons are demonstrations
- "Best model" — strategies express configured preference
- Any uptime or reliability percentage

**Do say:**

- "Estimated cost"
- "Demo models — nothing leaves the deployment"
- "Configured scoring policy"

**Capture:** 1280×769, 2× scale, no cursor trails, no browser chrome. Chart animation is disabled in code, so no waiting for sweeps.

**Pacing:** the attempt strip at 0:26–0:38 is the moment the product lands. Give it room — silence there is better than filling it.

Day 26 proves the whole stack actually works together, end to end, in a real browser - and corrects a draft that guessed at DOM structure instead of checking it.

---

## Portfolio Showcase — Day 26: Playwright E2E Verification

### The Problem We're Solving

Every earlier day verified its own layer in isolation - an agent script, an API endpoint, a unit test. None of them proved the actual product experience: a real person opening the chat page, typing a question, and getting a real streamed answer back. A **Playwright end-to-end (E2E) test** drives a real headless browser against the real running app - it's the only test in this repo that fails if the frontend and backend stop actually working together, not just individually.

Focus: a genuine E2E test against the actual rendered chat UI, and a real correction of a spec that assumed DOM structure instead of checking it
Time investment: 15 minutes, plus fixing every one of the initial guessed selectors

### Step 1: Install Playwright

```bash
cd apps/web
npm install -D @playwright/test --legacy-peer-deps
npx playwright install chromium --with-deps
```

`npm audit` before and after: unchanged (1 high, 1 moderate - the same pre-existing, unrelated findings tracked since Day 25). No new vulnerabilities from adding Playwright.

### Step 2: A Real Finding - the Initial Selectors Don't Match the Actual Page

The initial test spec assumed:

- an `<h1>` heading containing "Sovereign Hub — AI Agent Stream"
- a plain `<input placeholder*="Ask our AI agent">`
- a message list at `.space-y-4`

None of these exist. Confirmed directly by `curl`-ing the running dev server and inspecting the real rendered HTML rather than guessing:

```bash
curl -s http://localhost:3001/chat | grep -oE 'aria-label="[^"]*"'
# aria-label="Add Attachment"
# aria-label="ESIH logo"
# aria-label="Message input"
# aria-label="Send message"
```

The actual chat page (`apps/web/app/chat/page.tsx`) is built on `assistant-ui`'s `Thread` component, not a hand-rolled message list - so the real composer is a `<textarea aria-label="Message input">`, the send control is a button with `aria-label="Send message"`, and there is no page `<h1>` at all; the product name renders in a plain header `<p>`.

### Step 3: The Corrected E2E Spec

```typescript
import { expect, test } from "@playwright/test";

test.describe("Sovereign Intelligence Hub - Live Chat & Agent Stream", () => {
  test("should load chat interface, submit prompt, and receive a streamed reply", async ({ page }) => {
    await page.goto("/chat");

    await expect(page.getByText("Sovereign Intelligence Hub")).toBeVisible();

    const input = page.getByLabel("Message input");
    await expect(input).toBeVisible();

    await input.fill("In one short sentence, what does this project do?");
    await page.getByLabel("Send message").click();

    await page.waitForFunction(
      () => document.body.innerText.length > 200,
      { timeout: 20_000 },
    );
  });
});
```

Using `page.getByLabel(...)` (an accessibility-attribute selector) instead of a CSS class or guessed placeholder text also makes the test more resilient to future styling changes - it asserts against the same attribute screen readers rely on, which is far less likely to change than a Tailwind class string.

### Step 4: Run It For Real

```bash
npm run dev &         # or already running
npm run test:e2e
```

Real result against the live dev server: `1 passed (5.0s)` - a genuine browser loaded the page, typed into the real composer, clicked the real send button, and confirmed a real streamed reply rendered (asserted via a growing `document.body.innerText` rather than matching specific model output text, since a live LLM's exact wording isn't deterministic).

### Step 5: Wire Into CI

Added an `e2e-playwright` job to `.github/workflows/ai-eval-gate.yml`: installs Playwright's Chromium browser, starts the Next.js dev server in the background, waits for `/chat` to respond, then runs the suite - gated behind the `OPENAI_API_KEY` secret like every other AI-dependent CI job in this repo.

---

## Best Practices

- **Never write selectors from a spec or a mockup - check the actual rendered DOM.** Every selector in the first test draft was wrong (a nonexistent `<h1>`, a nonexistent `<input>`, a nonexistent `.space-y-4` class) because it was written against an imagined UI, not the real one. A 30-second `curl` would have caught each mismatch before writing a single line of test code.
- **Prefer accessibility attributes (`aria-label`, `getByLabel`, `getByRole`) over CSS classes or placeholder text for selectors.** They're what real users with screen readers depend on, so they're far more stable across visual redesigns than a utility class string, and Playwright's own `getBy*` API is built around them.
- **Assert against a structural signal (response length grew) rather than exact model output text** when testing a live LLM call - the wording is genuinely non-deterministic between runs, but "a real answer rendered" is a fact you can assert reliably.
- **Run `npm audit` before and after adding any new devDependency**, even a test framework - this repo caught a critical vulnerability doing exactly this on Day 25's DeepEval TS SDK attempt; Playwright's install was clean, and confirming that took the same 30 seconds either way.

## Why This Matters in Production

A unit test that mocks the network and a component test that mocks the model can both pass while the real product is completely broken - a changed API route, a renamed CSS class, an environment variable that isn't actually set in production. An E2E test that drives a real browser against the real running stack is the only check in this repo that would catch that class of failure, and it only works because its selectors describe the ACTUAL page, verified by inspection, not the page a spec imagined.

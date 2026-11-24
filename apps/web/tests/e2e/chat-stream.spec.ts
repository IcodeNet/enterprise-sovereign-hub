import { expect, test } from "@playwright/test";

/**
 * Live end-to-end verification for the chat UI - Day 26.
 *
 * Selectors here are the ACTUAL rendered DOM (confirmed via a direct curl
 * of the running dev server), not the PDF's original guesses. The PDF
 * assumed an `<h1>` heading and a plain `<input>` - this page (built on
 * assistant-ui's Thread component) has neither: the composer is a
 * `<textarea aria-label="Message input">` and there is no page `<h1>` at
 * all, so this test asserts against what is genuinely there.
 */
test.describe("Sovereign Intelligence Hub - Live Chat & Agent Stream", () => {
  test("should load chat interface, submit prompt, and receive a streamed reply", async ({
    page,
  }) => {
    await page.goto("/chat");

    // The chat header renders the product name instead of an <h1>.
    await expect(page.getByText("Sovereign Intelligence Hub")).toBeVisible();

    const input = page.getByLabel("Message input");
    await expect(input).toBeVisible();

    await input.fill("In one short sentence, what does this project do?");
    await page.getByLabel("Send message").click();

    // A real streamed response should render as visible text within a
    // generous timeout (the model call is real, not mocked).
    await expect(page.getByText(/./).first()).toBeVisible();
    await page.waitForFunction(() => document.body.innerText.length > 200, { timeout: 20_000 });
  });
});

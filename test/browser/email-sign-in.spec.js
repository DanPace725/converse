import { test, expect } from "@playwright/test";

test("email fallback sends only on submit, survives a bad code, restores the account and signs out", async ({
  page,
}, testInfo) => {
  let signedIn = false;
  const calls = [];
  await page.route("**/api/session", async (route) => {
    const request = route.request();
    if (request.method() === "GET")
      return route.fulfill({
        json: {
          sign_in: "google",
          access: signedIn,
          user: signedIn ? { email: "ada@example.com" } : null,
        },
      });
    if (request.method() === "DELETE") {
      signedIn = false;
      return route.fulfill({ json: { ok: true } });
    }
    const input = request.postDataJSON();
    calls.push(input);
    if (input.otp && input.otp !== "123456")
      return route.fulfill({
        status: 400,
        json: {
          error:
            "That code could not be verified. Try again or request a new code.",
        },
      });
    if (input.otp) signedIn = true;
    return route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/models", (route) =>
    route.fulfill(
      signedIn
        ? {
            json: {
              GPT: { models: ["gpt-fixture"] },
              Claude: { models: [] },
              Gemini: { models: [] },
            },
          }
        : { status: 401, json: { error: "Sign in to continue." } },
    ),
  );
  await page.route("**/api/conclave**", (route) =>
    route.fulfill({ json: { available: false } }),
  );
  await page.route("**/api/keys**", (route) =>
    route.fulfill({ json: { enabled: false } }),
  );
  await page.goto("/");
  await expect(page.locator("#google-sign-in")).toBeVisible();
  await page.locator("#email-sign-in summary").click();
  await page.locator("#sign-in-email").fill("ada@example.com");
  expect(calls).toEqual([]);
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  await expect(page.locator("#sign-in-code")).toBeVisible();
  await expect(page.locator("#unlock-error")).toContainText("Check your email");
  if (testInfo.project.name === "webkit-mobile")
    await page.screenshot({ path: testInfo.outputPath("email-fallback.png") });
  expect(calls).toEqual([{ provider: "email-code", email: "ada@example.com" }]);
  await page.locator("#sign-in-code").fill("000000");
  await page.locator("#email-code-submit").click();
  await expect(page.locator("#unlock-error")).toContainText(
    "could not be verified",
  );
  await expect(page.locator("#email-code-submit")).toBeEnabled();
  await page.locator("#email-code-reset").click();
  await expect(page.locator("#sign-in-code")).toBeHidden();
  await expect(page.locator("#sign-in-email")).toBeEditable();
  await page.locator("#email-code-submit").click();
  await expect(page.locator("#sign-in-code")).toBeVisible();
  await page.locator("#sign-in-code").fill("123456");
  await page.locator("#email-code-submit").click();
  await expect(page.locator("#unlock")).toBeHidden();
  await page.reload();
  await expect(page.locator("#status")).toHaveText("Ready");
  await page.locator("#more-menu > summary").click();
  await expect(page.locator("#sign-out")).toHaveText(
    "Sign out (ada@example.com)",
  );
  await page.locator("#sign-out").click();
  await expect(page.locator("#google-sign-in")).toBeVisible();
  await expect(page.locator("#email-sign-in")).toBeVisible();
});

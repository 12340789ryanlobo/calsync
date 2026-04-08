import { test, expect } from "@playwright/test";

test("navigation works across all pages", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toContainText("Dashboard");

  await page.click('a[href="/import"]');
  await expect(page.locator("h1")).toContainText("Import");

  await page.click('a[href="/settings"]');
  await expect(page.locator("h1")).toContainText("Settings");

  await page.click('a[href="/review"]');
  await expect(page.locator("h1")).toContainText("Review");
});

test("import sample data and see it on dashboard", async ({ page }) => {
  await page.goto("/import");

  // Switch to paste mode
  await page.getByText("Paste .ics Data").click();

  // Load sample data
  await page.getByText("Load sample data").click();
  const textarea = page.locator("textarea");
  await expect(textarea).not.toBeEmpty();

  // Give it a name and import
  await page.fill("#paste-name", "Test Calendar");
  await page.getByText("Add Calendar").click();

  // Should see success
  await expect(page.getByText(/Imported.*event/)).toBeVisible();

  // Navigate to dashboard
  await page.click("text=Dashboard");
  await expect(page.locator("h1")).toContainText("Dashboard");

  // Should see events and free slots (not the empty state)
  await expect(page.getByText("No calendar data yet")).not.toBeVisible();
  await expect(page.getByText("Review & Send Availability")).toBeVisible();
});

test("settings update working hours", async ({ page }) => {
  await page.goto("/settings");

  // Change end time to 6pm
  const endInput = page.locator("#end");
  await endInput.fill("18:00");

  // Verify the input took the value
  await expect(endInput).toHaveValue("18:00");
});

test("day detail page loads via dynamic route", async ({ page }) => {
  // Navigate to a specific day
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  await page.goto(`/day/${dateStr}`);

  // Should show the date and timeline
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Events" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Free Slots" })).toBeVisible();

  // Navigation arrows should work
  await expect(page.locator('a[href*="/day/"]').first()).toBeVisible();
});

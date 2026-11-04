import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { dependency, fixtures, mockFeed, preview } from "./harness.mjs";
const { chromium, webkit } = await dependency("playwright");
const { default: AxeBuilder } = await dependency(
  "@axe-core/playwright",
  "dist/index.mjs",
);
const server = await preview();
const reports = [];
const now = Date.UTC(2026, 10, 4, 12, 3);
const storageKey = "squeek-alert-lab:settings:v1";
const token = `987654321:${randomBytes(24).toString("base64url")}`;
const shots = "test/scratch/shots";
await mkdir(shots, { recursive: true });
async function run(name, fn) {
  const start = Date.now();
  try {
    await fn();
    reports.push({ name, passed: true, durationMs: Date.now() - start });
    console.log(`PASS ${name}`);
  } catch (error) {
    reports.push({ name, passed: false, error: error.stack });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}
async function pageFor(browser, width = 390) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.clock.install({ time: now });
  const state = fixtures(now),
    errors = [],
    resources = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.url().startsWith(server.url) && response.status() >= 400)
      resources.push(response.url());
  });
  await mockFeed(page, state);
  await page.goto(server.url);
  await page.getByText("Live feed", { exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  return { page, context, state, errors, resources };
}
async function fill(page) {
  await page.getByLabel("Telegram bot token", { exact: true }).fill(token);
  await page.getByLabel("Chat ID", { exact: true }).fill("7734128");
}
async function settled(page) {
  await page.waitForFunction(
    () =>
      !document.querySelector('button[aria-label="Refresh live status"]')
        .disabled,
  );
}
async function tick(page, state, changes = {}) {
  Object.assign(state, changes);
  state.now += 15000;
  await page.clock.runFor(15000);
  await settled(page);
}
const rows = (page) => page.locator(".alert-row");
const countSent = (page) => page.locator(".delivery.sent").count();
try {
  for (const [engine, launcher] of [
    ["Chromium", chromium],
    ["WebKit", webkit],
  ]) {
    const browser = await launcher.launch({ headless: true });
    try {
      await run(
        `${engine}: setup validation, privacy, test delivery, persistence, forget`,
        async () => {
          const { page, context, state, errors, resources } =
            await pageFor(browser);
          try {
            const startBox = await page
              .getByRole("button", { name: "Start watching", exact: true })
              .boundingBox();
            assert.ok(
              startBox.y + startBox.height < 844,
              "Main action is above the mobile fold",
            );
            await page
              .getByRole("button", { name: "Send test alert", exact: true })
              .click();
            assert.match(
              await page.locator("#setup-error").innerText(),
              /full bot token/,
            );
            assert.equal(
              await page
                .locator("#bot-token")
                .evaluate((el) => el === document.activeElement),
              true,
            );
            await fill(page);
            assert.equal(
              await page.locator("#bot-token").getAttribute("type"),
              "password",
            );
            await page.getByRole("button", { name: "Show bot token" }).click();
            assert.equal(
              await page.locator("#bot-token").getAttribute("type"),
              "text",
            );
            await page.getByRole("button", { name: "Hide bot token" }).click();
            await page
              .getByRole("button", { name: "Send test alert", exact: true })
              .click();
            await page
              .getByText("Test alert sent. Check your Telegram chat.")
              .waitFor();
            assert.equal(await countSent(page), 1);
            assert.match(state.messages[0].text, /This is a test alert/);
            assert.equal(state.messages[0].chat_id, "7734128");
            assert.ok(
              state.urls.every(
                (url) =>
                  !url.includes(token) ||
                  url.startsWith("https://api.telegram.org/"),
              ),
            );
            assert.ok(!state.messages[0].text.includes(token));
            await page.reload();
            await page.getByText("Live feed", { exact: true }).waitFor();
            assert.equal(await page.locator("#bot-token").inputValue(), token);
            assert.equal(await rows(page).count(), 0);
            assert.equal(
              await page
                .getByRole("button", { name: "Start watching", exact: true })
                .count(),
              1,
            );
            await page
              .getByRole("button", { name: "Forget saved bot" })
              .click();
            await page
              .getByRole("button", { name: "Cancel", exact: true })
              .click();
            assert.equal(await page.locator("#bot-token").inputValue(), token);
            await page
              .getByRole("button", { name: "Forget saved bot" })
              .click();
            await page
              .getByRole("button", { name: "Forget bot", exact: true })
              .click();
            assert.equal(await page.locator("#bot-token").inputValue(), "");
            assert.equal(
              await page.evaluate(
                (key) => localStorage.getItem(key),
                storageKey,
              ),
              null,
            );
            assert.deepEqual(errors, []);
            assert.deepEqual(resources, []);
          } finally {
            await context.close();
          }
        },
      );
      await run(
        `${engine}: 15-second polling, wake, both threshold directions, toggles, stop`,
        async () => {
          const { page, context, state } = await pageFor(browser);
          try {
            await fill(page);
            await page
              .getByRole("button", { name: "Start watching", exact: true })
              .click();
            await settled(page);
            assert.equal(await page.locator("#bot-token").isDisabled(), true);
            assert.equal(await rows(page).count(), 0);
            const calls = state.statusCalls;
            await tick(page, state, { rpm: 650 });
            await page
              .getByText("Hamster wake-up", { exact: true })
              .last()
              .waitFor();
            await page.waitForFunction(
              () => document.querySelectorAll(".delivery.sent").length === 2,
            );
            assert.equal(state.statusCalls, calls + 1);
            assert.equal(state.messages.length, 2);
            await tick(page, state);
            assert.equal(state.messages.length, 2);
            await tick(page, state, { rpm: 100 });
            await page.waitForFunction(
              () => document.querySelectorAll(".delivery.sent").length === 3,
            );
            assert.match(state.messages[2].text, /downward/);
            await page.locator("#trigger-wake").uncheck();
            await page.locator("#trigger-threshold").uncheck();
            await tick(page, state, { rpm: 0 });
            await tick(page, state, { rpm: 650 });
            assert.equal(state.messages.length, 3);
            await page
              .getByRole("button", { name: "Stop watching", exact: true })
              .click();
            await tick(page, state, { rpm: 0, round: 101 });
            assert.equal(state.messages.length, 3);
            assert.equal(await page.locator("#bot-token").isEnabled(), true);
          } finally {
            await context.close();
          }
        },
      );
      await run(
        `${engine}: five-minute sleep, no repeat, waking resets sleep`,
        async () => {
          const { page, context, state } = await pageFor(browser);
          try {
            state.rpm = 100;
            await fill(page);
            await page.locator("#trigger-threshold").uncheck();
            await page
              .getByRole("button", { name: "Start watching", exact: true })
              .click();
            await settled(page);
            await tick(page, state, { rpm: 0 });
            for (let i = 0; i < 19; i++) await tick(page, state);
            assert.equal(
              state.messages.length,
              0,
              "Before five minutes, no sleep alert",
            );
            await tick(page, state);
            await page.waitForFunction(
              () => document.querySelectorAll(".delivery.sent").length === 1,
            );
            assert.match(state.messages[0].text, /5 minutes/);
            await tick(page, state);
            assert.equal(state.messages.length, 1);
            await tick(page, state, { rpm: 100 });
            await page.waitForFunction(
              () => document.querySelectorAll(".delivery.sent").length === 2,
            );
            assert.match(state.messages[1].text, /wake-up/);
          } finally {
            await context.close();
          }
        },
      );
      await run(
        `${engine}: confirmed rounds, deduplication, history outage and recovery`,
        async () => {
          const { page, context, state } = await pageFor(browser);
          try {
            await fill(page);
            await page
              .getByRole("button", { name: "Start watching", exact: true })
              .click();
            await settled(page);
            await tick(page, state, { round: 101 });
            await page.waitForFunction(
              () => document.querySelectorAll(".delivery.sent").length === 1,
            );
            assert.match(state.messages[0].text, /Round #101 settled/);
            await tick(page, state);
            assert.equal(state.messages.length, 1);
            await tick(page, state, { historyFailure: true, rpm: 100 });
            await page.waitForFunction(
              () => document.querySelectorAll(".delivery.sent").length === 2,
            );
            assert.match(state.messages[1].text, /wake-up/);
            await tick(page, state, { historyFailure: false, round: 102 });
            await page.waitForFunction(
              () => document.querySelectorAll(".delivery.sent").length === 3,
            );
            assert.match(state.messages[2].text, /#102/);
          } finally {
            await context.close();
          }
        },
      );
      await run(
        `${engine}: stale/offline API and long poll gaps rebaseline without false alerts`,
        async () => {
          const { page, context, state } = await pageFor(browser);
          try {
            await fill(page);
            await page
              .getByRole("button", { name: "Start watching", exact: true })
              .click();
            await settled(page);
            await tick(page, state, { statusFailure: true });
            await page.getByText("Feed unavailable", { exact: true }).waitFor();
            await tick(page, state, { statusFailure: false, rpm: 650 });
            assert.equal(state.messages.length, 0);
            await tick(page, state, { stale: true });
            await page.getByText("Feed unavailable", { exact: true }).waitFor();
            await tick(page, state, { stale: false, rpm: 0 });
            assert.equal(state.messages.length, 0);
            state.now += 120000;
            state.rpm = 700;
            await page.clock.fastForward(120000);
            await settled(page);
            assert.equal(state.messages.length, 0);
            await page.getByText("Live feed", { exact: true }).waitFor();
          } finally {
            await context.close();
          }
        },
      );
      await run(
        `${engine}: Telegram rejection, manual retry, rate cooldown, log filter`,
        async () => {
          const { page, context, state } = await pageFor(browser);
          try {
            await fill(page);
            state.telegramError = 401;
            await page
              .getByRole("button", { name: "Send test alert", exact: true })
              .click();
            await page.locator(".delivery.failed").waitFor();
            assert.match(await rows(page).innerText(), /rejected this token/);
            assert.ok(
              !(await rows(page).innerText()).includes("UNTRUSTED RESPONSE"),
            );
            state.telegramError = 0;
            await page
              .getByRole("button", { name: "Retry alert", exact: true })
              .click();
            await page.getByText("Sent to Telegram", { exact: true }).waitFor();
            assert.equal(state.messages.length, 2);
            state.telegramError = 429;
            await page
              .getByRole("button", { name: "Send test alert", exact: true })
              .click();
            await page.getByText("Retry in 3s", { exact: true }).waitFor();
            assert.equal(
              await page
                .getByRole("button", { name: "Retry in 3s", exact: true })
                .isDisabled(),
              true,
            );
            state.telegramError = 0;
            await page.clock.runFor(4000);
            await page
              .getByRole("button", { name: "Retry alert", exact: true })
              .click();
            await page.waitForFunction(
              () => document.querySelectorAll(".delivery.sent").length === 2,
            );
            await page.getByLabel("Filter alert log").selectOption("failed");
            await page.getByText("No alerts match this filter").waitFor();
            await page.getByLabel("Filter alert log").selectOption("all");
            assert.equal(await rows(page).count(), 2);
            await page
              .getByRole("button", { name: "Clear log", exact: true })
              .click();
            assert.equal(await rows(page).count(), 0);
          } finally {
            await context.close();
          }
        },
      );
      await run(
        `${engine}: discover chat IDs, empty chats, webhook conflict`,
        async () => {
          const { page, context, state } = await pageFor(browser);
          try {
            await page.locator("#bot-token").fill(token);
            state.chatMode = "empty";
            await page
              .getByRole("button", { name: "Find chat ID", exact: true })
              .click();
            await page.getByText(/No recent chats found/).waitFor();
            state.chatMode = "single";
            state.chats[0].first_name = "A".repeat(100);
            await page
              .getByRole("button", { name: "Find chat ID", exact: true })
              .click();
            await page.getByText(/Chat ID found for/).waitFor();
            assert.ok(
              await page.evaluate(
                () =>
                  document.documentElement.scrollWidth <=
                  document.documentElement.clientWidth,
              ),
              "Long chat names wrap inside setup feedback",
            );
            assert.equal(
              await page.locator("#chat-id").inputValue(),
              "7734128",
            );
            state.chats.push({ id: -8773435, title: "Test group" });
            await page
              .getByRole("button", { name: "Find chat ID", exact: true })
              .click();
            await page
              .getByRole("button", { name: "Test group · -8773435" })
              .click();
            assert.equal(
              await page.locator("#chat-id").inputValue(),
              "-8773435",
            );
            state.chatMode = "conflict";
            await page
              .getByRole("button", { name: "Find chat ID", exact: true })
              .click();
            await page.getByText(/uses a webhook/).waitFor();
          } finally {
            await context.close();
          }
        },
      );
      await run(
        `${engine}: no triggers and invalid target prevent start; keyboard toggles`,
        async () => {
          const { page, context } = await pageFor(browser);
          try {
            await fill(page);
            for (const id of ["wake", "sleep", "round", "threshold"])
              await page.locator(`#trigger-${id}`).uncheck();
            await page
              .getByRole("button", { name: "Start watching", exact: true })
              .click();
            await page.getByText(/Choose at least one alert/).waitFor();
            await page.locator("#trigger-threshold").focus();
            await page.keyboard.press("Space");
            assert.equal(
              await page.locator("#trigger-threshold").isChecked(),
              true,
            );
            await page.locator("#rpm-target").fill("0");
            await page
              .getByRole("button", { name: "Start watching", exact: true })
              .click();
            assert.equal(
              await page
                .locator("#rpm-target")
                .evaluate((el) => el === document.activeElement),
              true,
            );
            await page.locator("#rpm-target").fill("700.5");
            await page
              .getByRole("button", { name: "Start watching", exact: true })
              .click();
            await page
              .getByRole("button", { name: "Stop watching", exact: true })
              .waitFor();
          } finally {
            await context.close();
          }
        },
      );
      await run(
        `${engine}: keyboard form, pending send and network recovery`,
        async () => {
          const { page, context, state } = await pageFor(browser);
          try {
            await fill(page);
            const send = page.getByRole("button", {
              name: "Send test alert",
              exact: true,
            });
            await page.locator("#chat-id").focus();
            await page.keyboard.press("Tab");
            assert.equal(
              await send.evaluate((el) => el === document.activeElement),
              true,
            );
            state.telegramDelay = true;
            await page.keyboard.press("Space");
            await page
              .getByRole("button", { name: "Sending test…", exact: true })
              .waitFor();
            assert.equal(
              await page
                .getByRole("button", { name: "Sending test…", exact: true })
                .isDisabled(),
              true,
            );
            assert.equal(await page.locator("#bot-token").isDisabled(), true);
            await page.waitForFunction(
              () =>
                document.querySelector(".delivery")?.textContent === "Sending…",
            );
            await state.telegramRelease();
            await page
              .getByText("Test alert sent. Check your Telegram chat.")
              .waitFor();
            assert.equal(state.messages.length, 1);
            state.telegramDelay = false;
            state.telegramFailNetwork = true;
            await send.focus();
            await page.keyboard.press("Enter");
            await page
              .getByText(/Delivery unconfirmed. Check your connection./)
              .waitFor();
            assert.equal(state.messages.length, 2);
            state.telegramFailNetwork = false;
            await page
              .getByRole("button", { name: "Retry alert", exact: true })
              .focus();
            await page.keyboard.press("Enter");
            await page.waitForFunction(
              () => document.querySelectorAll(".delivery.sent").length === 2,
            );
            await page
              .getByRole("button", { name: "Start watching", exact: true })
              .focus();
            await page.keyboard.press("Enter");
            await page
              .getByRole("button", { name: "Stop watching", exact: true })
              .waitFor();
            await page.keyboard.press("Enter");
            await page
              .getByRole("button", { name: "Start watching", exact: true })
              .waitFor();
          } finally {
            await context.close();
          }
        },
      );
      await run(
        `${engine}: responsive export, metadata, font, focus, accessibility`,
        async () => {
          const { page, context, errors, resources } = await pageFor(
            browser,
            1440,
          );
          try {
            for (const width of [320, 390, 560, 740, 800, 900, 1120, 1440]) {
              await page.setViewportSize({ width, height: 844 });
              assert.ok(
                await page.evaluate(
                  () =>
                    document.documentElement.scrollWidth <=
                    document.documentElement.clientWidth,
                ),
                `No overflow at ${width}`,
              );
            }
            await page.setViewportSize({ width: 390, height: 844 });
            const box = await page
              .getByRole("button", { name: "Start watching", exact: true })
              .boundingBox();
            assert.ok(box.y + box.height < 844);
            await page.locator("#bot-token").focus();
            assert.notEqual(
              await page
                .locator("#bot-token")
                .evaluate((el) => getComputedStyle(el).outlineStyle),
              "none",
            );
            if (engine === "Chromium")
              await page.screenshot({ path: `${shots}/mobile-focus.png` });
            const axe = await new AxeBuilder({ page }).analyze();
            assert.deepEqual(
              axe.violations.map((v) => ({
                id: v.id,
                nodes: v.nodes.map((n) => n.target),
              })),
              [],
            );
            assert.equal(
              await page.evaluate(() =>
                document.fonts.check('16px "Nunito Sans"'),
              ),
              true,
            );
            assert.ok((await page.title()).includes("Squeek Alert Lab"));
            assert.equal(
              await page
                .locator('meta[property="og:image"]')
                .getAttribute("content"),
              "./share.png",
            );
            await page.emulateMedia({ reducedMotion: "reduce" });
            assert.equal(
              await page.evaluate(() => document.getAnimations().length),
              0,
            );
            await page.evaluate(
              () => (document.documentElement.style.fontSize = "200%"),
            );
            assert.ok(
              await page.evaluate(
                () =>
                  document.documentElement.scrollWidth <=
                  document.documentElement.clientWidth,
              ),
              "200% text reflow",
            );
            await page.evaluate(() => {
              document.documentElement.style.fontSize = "";
              document.documentElement.dir = "rtl";
            });
            assert.ok(
              await page.evaluate(
                () =>
                  document.documentElement.scrollWidth <=
                  document.documentElement.clientWidth,
              ),
              "RTL mirror",
            );
            await page.evaluate(() => (document.documentElement.dir = "ltr"));
            if (engine === "Chromium") {
              await page.locator("#bot-token").blur();
              await page.screenshot({
                path: `${shots}/mobile-first-screen.png`,
              });
              await page.setViewportSize({ width: 1440, height: 1000 });
              await page.screenshot({
                path: `${shots}/desktop.png`,
                fullPage: true,
              });
            }
            assert.deepEqual(errors, []);
            assert.deepEqual(resources, []);
          } finally {
            await context.close();
          }
        },
      );
      if (engine === "Chromium")
        await run("Chromium: one watching tab owns the session", async () => {
          const { page, context, state } = await pageFor(browser);
          try {
            await fill(page);
            await page
              .getByRole("button", { name: "Start watching", exact: true })
              .click();
            await settled(page);
            const second = await context.newPage();
            await second.clock.install({ time: now });
            await mockFeed(second, state);
            await second.goto(server.url);
            await second.getByText("Live feed", { exact: true }).waitFor();
            await second
              .getByRole("button", { name: "Start watching", exact: true })
              .click();
            await second.getByText(/Another tab is already watching/).waitFor();
            await page
              .getByRole("button", { name: "Stop watching", exact: true })
              .click();
            await second
              .getByRole("button", { name: "Start watching", exact: true })
              .click();
            await second
              .getByRole("button", { name: "Stop watching", exact: true })
              .waitFor();
          } finally {
            await context.close();
          }
        });
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
  await writeFile(
    "test/scratch/browser-results.json",
    JSON.stringify(
      {
        reports,
        passed: reports.filter((x) => x.passed).length,
        total: reports.length,
      },
      null,
      2,
    ),
  );
}
console.log(
  `${reports.filter((x) => x.passed).length}/${reports.length} browser scenarios passed`,
);
if (reports.some((x) => !x.passed)) process.exitCode = 1;

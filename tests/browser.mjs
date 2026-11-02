import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dependency, fixtures, mockFeed, preview } from "./harness.mjs";

const { chromium, webkit } = await dependency("playwright");
const { default: AxeBuilder } = await dependency(
  "@axe-core/playwright",
  "dist/index.mjs",
);
const { generatePrivateKey, privateKeyToAccount } = await dependency(
  "viem",
  "_esm/accounts/index.js",
  "viem/accounts",
);
const server = await preview();
const reports = [];
const storageKey = "squeek-streak:league:v1";
const now = Date.UTC(2026, 10, 2, 12, 3, 0);
const shots = "test/scratch/shots";
await mkdir(shots, { recursive: true });

async function run(name, fn) {
  const started = Date.now();
  try {
    await fn();
    reports.push({ name, passed: true, durationMs: Date.now() - started });
    console.log(`PASS ${name}`);
  } catch (e) {
    reports.push({ name, passed: false, error: e.message });
    console.error(`FAIL ${name}: ${e.message}`);
  }
}
async function pageFor(
  browser,
  { width = 390, lowBalance, wallet = false } = {},
) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    deviceScaleFactor: 1,
    acceptDownloads: true,
  });
  const page = await context.newPage();
  await page.clock.install({ time: now });
  const state = fixtures(now);
  await mockFeed(page, state);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  if (lowBalance !== undefined) {
    await page.addInitScript(
      ({ storageKey, lowBalance }) => {
        if (localStorage.getItem(storageKey)) return;
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            version: 1,
            players: {
              guest: {
                id: "guest",
                name: "Seedling",
                balance: lowBalance,
                streak: 0,
                bestStreak: 0,
              },
            },
            predictions: [],
            duels: [],
          }),
        );
      },
      { storageKey, lowBalance },
    );
  }
  let accounts, requests;
  if (wallet) {
    accounts = [
      privateKeyToAccount(generatePrivateKey()),
      privateKeyToAccount(generatePrivateKey()),
    ];
    requests = [];
    await page.exposeFunction("testSignOnly", async ({ message, address }) => {
      const account = accounts.find(
        (a) => a.address.toLowerCase() === address.toLowerCase(),
      );
      assert.ok(account, "Signing must use a generated test account");
      return account.signMessage({ message: { raw: message } });
    });
    await page.exposeFunction("testRecordRequest", (method) =>
      requests.push(method),
    );
    await page.addInitScript(
      ({ addresses }) => {
        let connected = false;
        const listeners = {};
        let current = 0;
        window.testRejectSignature = false;
        const provider = {
          isMetaMask: false,
          on: (name, fn) => {
            (listeners[name] ??= []).push(fn);
          },
          removeListener: (name, fn) => {
            listeners[name] = (listeners[name] ?? []).filter((f) => f !== fn);
          },
          request: async ({ method, params }) => {
            await window.testRecordRequest(method);
            if (method === "eth_chainId") return "0x1";
            if (method === "eth_accounts")
              return connected ? [addresses[current]] : [];
            if (method === "eth_requestAccounts") {
              connected = true;
              return [addresses[current]];
            }
            if (method === "wallet_requestPermissions") {
              connected = true;
              return [{ parentCapability: "eth_accounts" }];
            }
            if (method === "wallet_getPermissions")
              return connected ? [{ parentCapability: "eth_accounts" }] : [];
            if (method === "personal_sign") {
              if (window.testRejectSignature) {
                const e = new Error("User rejected request");
                e.code = 4001;
                throw e;
              }
              return window.testSignOnly({
                message: params[0],
                address: params[1],
              });
            }
            if (method === "wallet_revokePermissions") {
              connected = false;
              return null;
            }
            throw new Error(`Unexpected wallet method: ${method}`);
          },
        };
        window.testSwitchAccount = () => {
          current = current === 0 ? 1 : 0;
          connected = true;
          for (const fn of listeners.accountsChanged ?? [])
            fn([addresses[current]]);
        };
        window.ethereum = provider;
        const announce = () =>
          dispatchEvent(
            new CustomEvent("eip6963:announceProvider", {
              detail: {
                info: {
                  uuid: "e8e99480-2cbe-4ffe-9920-84cfa357f803",
                  name: "Test Browser Wallet",
                  icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><circle cx="14" cy="14" r="12" fill="green"/></svg>',
                  rdns: "test.squeek.wallet",
                },
                provider,
              },
            }),
          );
        addEventListener("eip6963:requestProvider", announce);
        announce();
      },
      { addresses: accounts.map((a) => a.address) },
    );
  }
  await page.goto(server.url);
  await page.locator(".live-label").filter({ hasText: "Live" }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  return { page, context, state, errors, accounts, requests };
}
const saved = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
async function advanceFeed(page, state, nextTime, results = []) {
  state.status.generatedAt = new Date(nextTime).toISOString();
  state.status.measurement.observedAt = new Date(nextTime).toISOString();
  state.history.generatedAt = new Date(nextTime).toISOString();
  state.history.recentSettlements.unshift(...results);
  await page.clock.fastForward(
    nextTime - (await page.evaluate(() => Date.now())),
  );
  await page
    .getByRole("button", { name: "Refresh live feed", exact: true })
    .click();
  await page.waitForTimeout(300);
  await page.clock.runFor(5100);
}
async function reopenAfterGrace(page, state, { work = 280, late = false } = {}) {
  const before = await saved(page);
  await page.goto("about:blank");
  const end = state.currentStart + 1_200_000;
  const reopenedAt = end + 1_200_001;
  if (work !== null)
    state.history.recentSettlements.unshift({
      previousSettledThroughRound: "101",
      settledThroughRound: "102",
      workAdded: String(work),
      confirmationStatus: "safe",
      blockTimestamp: new Date(late ? reopenedAt : end + 1000).toISOString(),
    });
  state.status.generatedAt = state.status.measurement.observedAt =
    state.history.generatedAt = new Date(reopenedAt).toISOString();
  let releaseHistory, historyRequested;
  const held = new Promise((resolve) => (releaseHistory = resolve));
  const requested = new Promise((resolve) => (historyRequested = resolve));
  await page.route((url) => url.pathname === "/v1/settlements", async (route) => {
    historyRequested();
    await held;
    await route.fallback();
  });
  await page.clock.setFixedTime(reopenedAt);
  await page.goto(server.url);
  await requested;
  try {
    // Run a settlement timer while initial history is still loading. It must
    // not refund either a solo pick or a matched duel ahead of that response.
    await page.clock.runFor(5100);
    assert.deepEqual(await saved(page), before);
  } finally {
    releaseHistory();
  }
  await page.waitForFunction(
    (key) => JSON.parse(localStorage.getItem(key)).predictions.every(
      (p) => p.outcome !== "pending",
    ),
    storageKey,
  );
  return saved(page);
}
async function signIn(page) {
  await page.locator(".connect-button").click();
  await page
    .getByRole("button", { name: "Test Browser Wallet", exact: false })
    .click();
  await page.locator("dialog").waitFor({ state: "hidden" });
  await page
    .locator(".account-mode")
    .filter({ hasText: "Wallet player" })
    .waitFor();
}

let browser;
try {
  browser = await chromium.launch({ headless: true });
  await run(
    "Chromium: reopening waits for history, settles timely solo wins/losses, refunds missing or late data",
    async () => {
      for (const scenario of [
        { band: "run", work: 280, outcome: "won", balance: 1100 },
        { band: "sleep", work: 280, outcome: "lost", balance: 900 },
        { band: "run", work: null, outcome: "refunded", balance: 1000 },
        { band: "run", work: 280, late: true, outcome: "refunded", balance: 1000 },
      ]) {
        const { page, context, state, errors } = await pageFor(browser);
        try {
          await page.locator(`input[value="${scenario.band}"]`).check();
          await page.getByRole("button", { name: "Lock prediction", exact: true }).click();
          await page.locator(".predict-button").filter({ hasText: "locked" }).waitFor();
          const data = await reopenAfterGrace(page, state, scenario);
          assert.equal(data.predictions[0].outcome, scenario.outcome);
          assert.equal(data.players.guest.balance, scenario.balance);
          assert.equal(data.players.guest.streak, scenario.outcome === "won" ? 1 : 0);
          await page.reload();
          await page.locator(".live-label").filter({ hasText: "Live" }).waitFor();
          assert.deepEqual(await saved(page), data, "Reopening cannot credit a completed pick twice");
          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      }
    },
  );
  await run(
    "Chromium: maximum-length player name keeps both history filters and CSV inside mobile viewport",
    async () => {
      const { page, context, errors } = await pageFor(browser, { width: 320 });
      try {
        await page.locator(".account-name").click();
        await page.getByLabel("Player name", { exact: true }).fill("W".repeat(24));
        await page.getByRole("button", { name: "Save player name" }).click();
        for (const width of [320, 390, 440, 740, 1440]) {
          await page.setViewportSize({ width, height: 844 });
          await page.locator(".history-toolbar").scrollIntoViewIfNeeded();
          const layout = await page.evaluate(() => {
            const toolbar = document.querySelector(".history-toolbar").getBoundingClientRect();
            const filters = document.querySelector(".history-filters").getBoundingClientRect();
            return {
              viewport: innerWidth,
              scrollWidth: document.documentElement.scrollWidth,
              filtersWidth: filters.width,
              toolbarWidth: toolbar.width,
              controlsInside: [...document.querySelectorAll(".history-toolbar select, .export-button")].every(el => {
                const r = el.getBoundingClientRect();
                return r.x >= toolbar.x && r.right <= toolbar.right && r.width > 0;
              }),
            };
          });
          assert.equal(layout.scrollWidth, width);
          assert.ok(layout.controlsInside, JSON.stringify(layout));
          if (width <= 440) assert.equal(layout.filtersWidth, layout.toolbarWidth);
          await page.getByLabel("Filter history by result").selectOption("won");
          await page.getByLabel("History player").selectOption("self");
          if (width === 320) await page.screenshot({ path: `${shots}/long-name-history-320.png` });
        }
        assert.deepEqual(errors, []);
      } finally {
        await context.close();
      }
    },
  );
  await run(
    "Chromium: prediction, exact result, streak payout, duplicate prevention, history, CSV and leaderboard",
    async () => {
      const { page, context, state, errors } = await pageFor(browser);
      const box = await page.locator(".predict-button").boundingBox();
      assert.ok(
        box.y + box.height < 844,
        "Primary action must fit first mobile screen",
      );
      await page.getByLabel("Your stake", { exact: true }).fill("7");
      await page.getByRole("button", { name: "Lock prediction" }).click();
      assert.match(
        await page.locator("#prediction-error").innerText(),
        /10 to 500/,
      );
      assert.equal(
        await page
          .locator("#stake")
          .evaluate((el) => el === document.activeElement),
        true,
      );
      await page.getByRole("button", { name: "100", exact: true }).click();
      await page.getByRole("radio", { name: /Run 100/ }).check();
      await page.getByRole("button", { name: "Lock prediction" }).click();
      await page
        .locator(".predict-button")
        .filter({ hasText: "Run prediction locked" })
        .waitFor();
      let data = await saved(page);
      assert.equal(data.predictions.length, 1);
      assert.equal(data.predictions[0].round, 102);
      assert.equal(data.players.guest.balance, 900);
      assert.equal(await page.locator(".predict-button").isDisabled(), true);
      await page.reload();
      await page.locator(".live-label").filter({ hasText: "Live" }).waitFor();
      assert.equal((await saved(page)).players.guest.balance, 900);
      const end = state.currentStart + 1_200_000;
      await advanceFeed(page, state, end + 1000, [
        {
          settledThroughRound: "102",
          previousSettledThroughRound: "101",
          workAdded: "280",
          confirmationStatus: "safe",
          blockTimestamp: new Date(end + 1000).toISOString(),
        },
      ]);
      data = await saved(page);
      assert.equal(data.predictions[0].outcome, "won");
      assert.equal(data.players.guest.balance, 1100);
      assert.equal(data.players.guest.streak, 1);
      assert.match(await page.locator(".multiplier-tag").innerText(), /2.25/);
      await page.getByRole("button", { name: "Weekly leaderboard" }).click();
      assert.match(
        await page.locator(".leaderboard-row").innerText(),
        /\+100 SP/,
      );
      await page
        .locator(".player-history-button")
        .filter({ hasText: "Seedling" })
        .click();
      await page.getByLabel("Filter history by result").selectOption("won");
      assert.equal(await page.locator(".history-row").count(), 1);
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: "Export my CSV" }).click();
      assert.equal(
        (await download).suggestedFilename(),
        "squeek-streak-history.csv",
      );
      await page.screenshot({
        path: `${shots}/mobile-won-history.png`,
        fullPage: true,
      });
      assert.deepEqual(errors, []);
      await context.close();
    },
  );
  await run(
    "Chromium: missing data returns reserved stake after 20-minute grace",
    async () => {
      const { page, context, state } = await pageFor(browser);
      await page.getByRole("button", { name: "Lock prediction" }).click();
      await page
        .locator(".predict-button")
        .filter({ hasText: "locked" })
        .waitFor();
      state.failure = true;
      await page.clock.fastForward(state.currentStart + 2_400_001 - now);
      await page.clock.runFor(5200);
      const data = await saved(page);
      assert.equal(data.predictions[0].outcome, "refunded");
      assert.equal(data.players.guest.balance, 1000);
      assert.ok(await page.locator(".predict-button").isDisabled());
      await page.screenshot({
        path: `${shots}/mobile-refund.png`,
        fullPage: true,
      });
      await context.close();
    },
  );
  await run(
    "Chromium: relief threshold, once-per-day claim and name editing",
    async () => {
      const { page, context } = await pageFor(browser, { lowBalance: 100 });
      await page
        .getByRole("button", { name: "Daily relief", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Claim 300 SP", exact: false })
        .click();
      await page.waitForFunction(
        (key) =>
          JSON.parse(localStorage.getItem(key)).players.guest.balance === 400,
        storageKey,
      );
      assert.equal((await saved(page)).players.guest.balance, 400);
      await page
        .getByRole("button", { name: "Daily relief", exact: true })
        .click();
      assert.equal(
        await page
          .getByRole("button", { name: "Claim 300 SP", exact: false })
          .isDisabled(),
        true,
      );
      await page.keyboard.press("Escape");
      await page.locator(".account-name").click();
      await page
        .getByLabel("Player name", { exact: true })
        .fill("Pip the Forecaster");
      await page.getByRole("button", { name: "Save player name" }).click();
      await page.waitForFunction(
        (key) =>
          JSON.parse(localStorage.getItem(key)).players.guest.name ===
          "Pip the Forecaster",
        storageKey,
      );
      assert.equal(
        (await saved(page)).players.guest.name,
        "Pip the Forecaster",
      );
      await context.close();
    },
  );
  await run(
    "Chromium: available history settles a pick during a wheel-status outage",
    async () => {
      const { page, context, state } = await pageFor(browser);
      await page.getByRole("button", { name: "Lock prediction" }).click();
      await page
        .locator(".predict-button")
        .filter({ hasText: "locked" })
        .waitFor();
      state.statusFailure = true;
      const end = state.currentStart + 1_200_000;
      await advanceFeed(page, state, end + 1000, [
        {
          settledThroughRound: "102",
          previousSettledThroughRound: "101",
          workAdded: "280",
          confirmationStatus: "safe",
          blockTimestamp: new Date(end + 1000).toISOString(),
        },
      ]);
      const data = await saved(page);
      assert.equal(data.players.guest.balance, 1100);
      assert.equal(data.predictions[0].outcome, "won");
      assert.match(await page.locator(".live-label").innerText(), /Paused/);
      assert.equal(await page.locator(".predict-button").isDisabled(), true);
      await context.close();
    },
  );
  await run(
    "Chromium: EIP-6963 signature login, two-wallet duel and winner-takes-pot settlement",
    async () => {
      const { page, context, state, accounts, requests } = await pageFor(
        browser,
        { wallet: true },
      );
      await signIn(page);
      await page
        .getByRole("button", { name: "1v1 duel", exact: false })
        .click();
      await page
        .getByRole("button", { name: "Create a duel", exact: true })
        .click();
      await page.locator(".duel-row").waitFor();
      let data = await saved(page);
      assert.equal(data.duels.length, 1);
      assert.equal(data.duels[0].status, "open");
      await page.evaluate(() => window.testSwitchAccount());
      await page
        .locator(".account-mode")
        .filter({ hasText: "Guest practice" })
        .waitFor();
      await signIn(page);
      await page.getByRole("radio", { name: /Sleep 0/ }).check();
      await page.getByRole("button", { name: "Join with Sleep" }).click();
      await page.locator(".duel-row").waitFor({ state: "hidden" });
      data = await saved(page);
      assert.equal(data.duels[0].status, "matched");
      assert.equal(data.predictions.length, 2);
      const end = state.currentStart + 1_200_000;
      await advanceFeed(page, state, end + 1000, [
        {
          settledThroughRound: "102",
          previousSettledThroughRound: "101",
          workAdded: "280",
          confirmationStatus: "safe",
          blockTimestamp: new Date(end + 1000).toISOString(),
        },
      ]);
      data = await saved(page);
      assert.equal(
        data.players[accounts[0].address.toLowerCase()].balance,
        1100,
      );
      assert.equal(
        data.players[accounts[1].address.toLowerCase()].balance,
        900,
      );
      assert.equal(data.duels[0].status, "settled");
      assert.ok(requests.includes("personal_sign"));
      assert.equal(
        requests.some((m) =>
          /sendTransaction|signTransaction|sendCalls|switchEthereumChain|addEthereumChain/.test(
            m,
          ),
        ),
        false,
      );
      await page.getByRole("button", { name: "Weekly leaderboard" }).click();
      await page.screenshot({
        path: `${shots}/duel-leaderboard.png`,
        fullPage: true,
      });
      await context.close();
    },
  );
  await run(
    "Chromium: reopening a matched two-wallet duel after grace pays the confirmed pot",
    async () => {
      const { page, context, state, errors } = await pageFor(browser, { wallet: true });
      try {
        await signIn(page);
        await page.getByRole("button", { name: "1v1 duel", exact: false }).click();
        await page.getByRole("button", { name: "Create a duel", exact: true }).click();
        await page.locator(".duel-row").waitFor();
        await page.evaluate(() => window.testSwitchAccount());
        await page.locator(".account-mode").filter({ hasText: "Guest practice" }).waitFor();
        await signIn(page);
        await page.getByRole("radio", { name: /Sleep 0/ }).check();
        await page.getByRole("button", { name: "Join with Sleep" }).click();
        await page.locator(".duel-row").waitFor({ state: "hidden" });
        const data = await reopenAfterGrace(page, state);
        const duel = data.duels[0];
        assert.equal(duel.status, "settled");
        assert.equal(data.players[duel.host].balance, 1100);
        assert.equal(data.players[duel.guest].balance, 900);
        assert.equal(data.predictions.find(p => p.player === duel.host).outcome, "won");
        assert.equal(data.predictions.find(p => p.player === duel.guest).outcome, "lost");
        assert.equal(data.players[duel.host].streak, 0);
        assert.deepEqual(errors, []);
      } finally {
        await context.close();
      }
    },
  );
  await run(
    "Chromium: rejected signature stays signed out and can retry",
    async () => {
      const { page, context } = await pageFor(browser, { wallet: true });
      await page.evaluate(() => {
        window.testRejectSignature = true;
      });
      await page.locator(".connect-button").click();
      await page
        .getByRole("button", { name: "Test Browser Wallet", exact: false })
        .click();
      await page
        .locator(".wallet-error")
        .filter({ hasText: "Signature cancelled" })
        .waitFor();
      assert.match(await page.locator(".account-mode").innerText(), /Guest/);
      await page.evaluate(() => {
        window.testRejectSignature = false;
      });
      await page
        .getByRole("button", { name: "Sign in as", exact: false })
        .click();
      await page.locator("dialog").waitFor({ state: "hidden" });
      assert.match(
        await page.locator(".account-mode").innerText(),
        /Wallet player/,
      );
      await context.close();
    },
  );
  await run(
    "Chromium: modal keyboard focus, Escape return and history filter empty state",
    async () => {
      const { page, context } = await pageFor(browser, { width: 1440 });
      await page
        .getByRole("button", { name: "How to play", exact: true })
        .first()
        .focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog");
      assert.ok(await dialog.isVisible());
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press("Tab");
        assert.equal(
          await page.evaluate(
            () => !!document.activeElement?.closest("dialog"),
          ),
          true,
        );
      }
      await page.keyboard.press("Escape");
      assert.equal(
        await page
          .getByRole("button", { name: "How to play", exact: true })
          .first()
          .evaluate((el) => el === document.activeElement),
        true,
      );
      await page.getByLabel("Filter history by result").selectOption("won");
      assert.match(
        await page.locator(".history-empty").innerText(),
        /No won predictions/,
      );
      await page.getByRole("button", { name: "Show all results" }).click();
      assert.equal(
        await page.getByLabel("Filter history by result").inputValue(),
        "all",
      );
      await context.close();
    },
  );
  await run(
    "Chromium: 320/390/740/900/1440 layout, first action, reduced motion and axe audit",
    async () => {
      const { page, context, errors, state } = await pageFor(browser, {
        width: 1440,
      });
      for (const width of [320, 390, 740, 900, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
          `Overflow at ${width}`,
        );
        await page.screenshot({
          path: `${shots}/final-${width}.png`,
          fullPage: true,
        });
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        "200% text reflow at 390",
      );
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "";
      });
      await page.setViewportSize({ width: 1440, height: 844 });
      const axe = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      await writeFile(
        "test/scratch/axe.json",
        JSON.stringify(axe.violations, null, 2),
      );
      assert.deepEqual(
        axe.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.map((n) => n.target),
        })),
        [],
      );
      state.status.measurement.coreStatus = "RUNNING";
      state.status.measurement.rpmMilli = 12_500;
      state.status.measurement.speedMmPerSecond = 79;
      state.status.builder.queued.openRoundWorkUnits = "23";
      await page
        .getByRole("button", { name: "Refresh live feed", exact: true })
        .click();
      await page
        .locator(".state-badge")
        .filter({ hasText: "Running" })
        .waitFor();
      assert.match(await page.locator(".wheel-metrics").innerText(), /12.5/);
      assert.match(await page.locator(".wheel-metrics").innerText(), /79/);
      assert.match(await page.locator(".wheel-metrics").innerText(), /23/);
      assert.equal(
        await page
          .locator(".wheel-spokes")
          .evaluate((el) => getComputedStyle(el).animationName),
        "wheel-turn",
      );
      await page.emulateMedia({ reducedMotion: "reduce" });
      assert.equal(
        await page
          .locator(".wheel-spokes")
          .evaluate((el) => getComputedStyle(el).animationName),
        "none",
      );
      assert.deepEqual(errors, []);
      await context.close();
    },
  );
  await run(
    "Chromium: API failure is recoverable and never fabricates live data",
    async () => {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
      });
      const page = await context.newPage();
      const state = { ...fixtures(Date.now()), failure: true };
      await mockFeed(page, state);
      await page.goto(server.url);
      await page.locator(".feed-error").waitFor();
      assert.equal(await page.locator(".predict-button").isDisabled(), true);
      assert.match(await page.locator(".live-label").innerText(), /Paused/);
      state.failure = false;
      await page.getByRole("button", { name: "Retry feed" }).click();
      await page.locator(".live-label").filter({ hasText: "Live" }).waitFor();
      assert.equal(await page.locator(".predict-button").isEnabled(), true);
      await context.close();
    },
  );
} finally {
  await browser?.close();
}
try {
  await run("WebKit: mobile primary prediction and wallet sheet", async () => {
    const browser = await webkit.launch();
    try {
      const { page, context, errors } = await pageFor(browser);
      await page.getByRole("button", { name: "Lock prediction" }).click();
      await page
        .locator(".predict-button")
        .filter({ hasText: "locked" })
        .waitFor();
      assert.equal((await saved(page)).players.guest.balance, 900);
      await page.locator(".connect-button").click();
      assert.ok(await page.getByRole("dialog").isVisible());
      await page.keyboard.press("Escape");
      assert.deepEqual(errors, []);
      await page.screenshot({
        path: `${shots}/webkit-mobile.png`,
        fullPage: true,
      });
      await context.close();
    } finally {
      await browser.close();
    }
  });
} finally {
  await server.close();
  await writeFile(
    "test/scratch/browser-results.json",
    JSON.stringify(reports, null, 2),
  );
  console.log(
    `${reports.filter((r) => r.passed).length}/${reports.length} browser checks passed`,
  );
  if (reports.some((r) => !r.passed)) process.exitCode = 1;
}

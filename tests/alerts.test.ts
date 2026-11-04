import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_RULES,
  newWheelMemory,
  observeWheel,
  newRoundMemory,
  observeRounds,
  type WheelMemory,
} from "../src/lib/alerts";
import {
  parseHistory,
  parseStatus,
  uint,
  type WheelStatus,
} from "../src/lib/api";
import {
  credentialsError,
  initialSettings,
  validTarget,
} from "../src/lib/settings";
import { sendTelegram, findTelegramChats } from "../src/lib/telegram";
const start = Date.UTC(2026, 10, 4, 12);
const wheel = (
  rpm: number,
  elapsed = 0,
  installation = "fixture",
): WheelStatus => ({
  installation,
  rpm,
  coreStatus: "IDLE",
  receivedAt: start + elapsed,
  observedAt: start + elapsed,
  staleAfter: 120000,
  generatedAt: start + elapsed,
});
const sample = (rpm = 0) => ({
  installationId: "fixture",
  generatedAt: new Date(start).toISOString(),
  measurement: {
    freshness: "online",
    rpmMilli: rpm,
    observedAt: new Date(start).toISOString(),
    staleAfterSeconds: 120,
  },
  builder: { status: "available", queued: { openRoundWorkUnits: "321" } },
});
const observe = (
  memory: WheelMemory,
  rpm: number,
  elapsed: number,
  rules = DEFAULT_RULES,
) => observeWheel(memory, wheel(rpm, elapsed), rules, start + elapsed);

test("first reading establishes a baseline, including a running wheel", () => {
  assert.deepEqual(observe(newWheelMemory(), 650, 0).events, []);
  assert.deepEqual(observe(newWheelMemory(), 0, 0).events, []);
});
test("wake-up and upward threshold occur exactly once at a crossing", () => {
  const baseline = observe(newWheelMemory(), 0, 0).memory;
  const awake = observe(baseline, 500, 15000);
  assert.deepEqual(
    awake.events.map((event) => event.kind),
    ["wake", "threshold"],
  );
  assert.equal(observe(awake.memory, 650, 30000).events.length, 0);
});
test("threshold crosses down and does not repeat at equality", () => {
  const baseline = observe(newWheelMemory(), 650, 0).memory;
  const equal = observe(baseline, 500, 15000);
  assert.equal(equal.events.length, 0);
  assert.match(
    observe(equal.memory, 499.999, 30000).events[0].title,
    /downward/,
  );
});
test("sleep is sent once after five minutes of continuous zero polls, then resets", () => {
  let memory = observe(newWheelMemory(), 10, 0).memory;
  const events = [];
  for (let elapsed = 15000; elapsed <= 360000; elapsed += 15000) {
    const result = observe(memory, 0, elapsed);
    memory = result.memory;
    events.push(...result.events);
  }
  assert.equal(events.filter((event) => event.kind === "sleep").length, 1);
  assert.equal(
    events.find((event) => event.kind === "sleep")!.at,
    start + 315000,
  );
  memory = observe(memory, 10, 375000).memory;
  memory = observe(memory, 0, 390000).memory;
  assert.equal(memory.zeroSince, start + 390000);
});
test("initially sleeping is not treated as a transition back to sleep", () => {
  let memory = observe(newWheelMemory(), 0, 0).memory;
  for (let elapsed = 15000; elapsed <= 330000; elapsed += 15000) {
    const result = observe(memory, 0, elapsed);
    memory = result.memory;
    assert.equal(result.events.length, 0);
  }
});
test("a brief stop resets when the wheel runs again", () => {
  let memory = observe(newWheelMemory(), 100, 0).memory;
  memory = observe(memory, 0, 15000).memory;
  memory = observe(memory, 100, 30000).memory;
  assert.equal(memory.zeroSince, null);
});
test("disabled events never send; changing a threshold rebaselines it", () => {
  const baseline = observe(newWheelMemory(), 0, 0).memory;
  assert.equal(
    observe(baseline, 600, 15000, {
      ...DEFAULT_RULES,
      wake: false,
      threshold: false,
    }).events.length,
    0,
  );
  assert.deepEqual(
    observe(observe(newWheelMemory(), 450, 0).memory, 550, 15000, {
      ...DEFAULT_RULES,
      rpmTarget: 520,
    }).events,
    [],
  );
});
test("a poll gap, changed installation or regressed sensor time rebaselines", () => {
  const baseline = observe(newWheelMemory(), 0, 0).memory;
  assert.equal(observe(baseline, 650, 60000).events.length, 0);
  assert.equal(
    observeWheel(
      baseline,
      wheel(650, 15000, "new fixture"),
      DEFAULT_RULES,
      start + 15000,
    ).events.length,
    0,
  );
  assert.equal(
    observeWheel(
      baseline,
      { ...wheel(650, 15000), observedAt: start - 1000 },
      DEFAULT_RULES,
      start + 15000,
    ).events.length,
    0,
  );
});
test("RPM uses milli units; missing current work stays missing", () => {
  assert.equal(parseStatus(sample(500123), start).rpm, 500.123);
  assert.equal(parseStatus(sample(), start).openWork, 321);
  assert.equal(
    parseStatus({ ...sample(), builder: {} }, start).openWork,
    undefined,
  );
});
test("bad, stale and offline measurements cannot become live data", () => {
  assert.throws(() => parseStatus(null, start));
  assert.throws(() => parseStatus(sample(), start + 121000), /out of date/);
  assert.throws(
    () =>
      parseStatus(
        {
          ...sample(),
          measurement: { ...sample().measurement, freshness: "offline" },
        },
        start,
      ),
    /offline/,
  );
  assert.equal(uint("bogus"), undefined);
  assert.equal(uint(-1), undefined);
  assert.equal(uint(Number.MAX_SAFE_INTEGER + 1), undefined);
});
const historyPayload = () => ({
  installationId: "fixture",
  status: "available",
  generatedAt: new Date(start).toISOString(),
  recentSettlements: [
    {
      previousSettledThroughRound: "99",
      settledThroughRound: "100",
      confirmationStatus: "safe",
      workAdded: "10",
      blockTimestamp: new Date(start).toISOString(),
    },
  ],
  mining: {
    nextRound: { round: "101" },
    recentCheckpoints: [
      {
        afterRound: "100",
        throughRound: "101",
        confirmationStatus: "safe",
        blockTimestamp: new Date(start).toISOString(),
      },
    ],
  },
});
test("safe checkpoints include zero-work rounds and unsafe entries are excluded", () => {
  const payload = historyPayload();
  payload.recentSettlements.push({
    ...payload.recentSettlements[0],
    settledThroughRound: "103",
    confirmationStatus: "pending",
  });
  const history = parseHistory(payload, start);
  assert.deepEqual(
    history.settlements.map((record) => record.through),
    [100, 101],
  );
});
test("round baseline suppresses history; overlapping proofs do not duplicate new alerts", () => {
  const history = parseHistory(historyPayload(), start);
  const baseline = observeRounds(newRoundMemory(), history, true, start);
  assert.equal(baseline.events.length, 0);
  const next = {
    ...history,
    settlements: [
      ...history.settlements,
      { from: 102, through: 102, at: start },
      { from: 102, through: 102, at: start, work: 50 },
    ],
  };
  const result = observeRounds(baseline.memory, next, true, start);
  assert.equal(result.events.length, 1);
  assert.match(result.events[0].title, /#102/);
  assert.equal(
    observeRounds(result.memory, next, true, start).events.length,
    0,
  );
});
test("disabled round alerts advance baseline; installations do not mix", () => {
  const history = parseHistory(historyPayload(), start);
  const memory = { installation: history.installation, through: 99 };
  const disabled = observeRounds(memory, history, false, start);
  assert.equal(disabled.events.length, 0);
  assert.equal(disabled.memory.through, 101);
  assert.equal(
    observeRounds(memory, { ...history, installation: "new" }, true, start)
      .events.length,
    0,
  );
});
test("batch messages name the range without inventing individual work", () => {
  const result = observeRounds(
    { installation: "fixture", through: 100 },
    {
      installation: "fixture",
      generatedAt: start,
      settlements: [{ from: 101, through: 104, work: 900, at: start }],
    },
    true,
    start,
  );
  assert.match(result.events[0].title, /#101–104/);
  assert.match(result.events[0].message, /across this batch/);
});
test("empty history can establish a later baseline safely", () => {
  const history = {
    installation: "fixture",
    generatedAt: start,
    settlements: [],
  };
  const empty = observeRounds(newRoundMemory(), history, true, start);
  assert.equal(empty.memory.through, null);
  assert.equal(
    observeRounds(
      empty.memory,
      { ...history, settlements: [{ from: 1, through: 2, at: start }] },
      true,
      start,
    ).events.length,
    0,
  );
});
test("credential and target validation reject blanks and invalid ranges", () => {
  assert.equal(credentialsError(initialSettings())?.field, "token");
  assert.equal(validTarget(""), false);
  assert.equal(validTarget("0"), false);
  assert.equal(validTarget("Infinity"), false);
  assert.equal(validTarget("-1"), false);
  assert.equal(validTarget("1000001"), false);
  assert.equal(validTarget("500.5"), true);
});
test("Telegram uses a POST directly to Telegram with no referrer or cookies", async () => {
  const original = globalThis.fetch;
  const token = `123456:${crypto.randomUUID().replaceAll("-", "")}`;
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, `https://api.telegram.org/bot${token}/sendMessage`);
      assert.equal(init?.method, "POST");
      assert.equal(init?.credentials, "omit");
      assert.equal(init?.referrerPolicy, "no-referrer");
      assert.equal(init?.redirect, "error");
      assert.equal((init?.body as URLSearchParams).get("text"), "Test");
      return new Response(JSON.stringify({ ok: true }));
    };
    await sendTelegram(token, "-1234567", "Test");
  } finally {
    globalThis.fetch = original;
  }
});
test("Telegram errors are sanitized and 429 carries a retry deadline", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          ok: false,
          error_code: 401,
          description: "UNTRUSTED SECRET",
        }),
        { status: 401 },
      );
    await assert.rejects(
      sendTelegram("test-only", "test-only", "Test"),
      /rejected this token/,
    );
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          ok: false,
          error_code: 429,
          parameters: { retry_after: 3 },
        }),
        { status: 429 },
      );
    await assert.rejects(
      sendTelegram("test-only", "test-only", "Test"),
      (error: unknown) =>
        error instanceof Error &&
        "retryAt" in error &&
        Number(error.retryAt) >= Date.now() + 2000,
    );
    globalThis.fetch = async () => {
      throw new Error("https://example.invalid/SECRET");
    };
    await assert.rejects(
      sendTelegram("test-only", "test-only", "Test"),
      (error) =>
        error instanceof Error &&
        !error.message.includes("SECRET") &&
        error.message.includes("unconfirmed"),
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("chat discovery deduplicates IDs; it never acknowledges updates or removes webhooks", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init) => {
      assert.match(String(url), /\/getUpdates$/);
      assert.equal((init?.body as URLSearchParams).has("offset"), false);
      return new Response(
        JSON.stringify({
          ok: true,
          result: [
            { message: { chat: { id: -12345, title: "Test group" } } },
            { my_chat_member: { chat: { id: -12345, title: "Test group" } } },
          ],
        }),
      );
    };
    assert.deepEqual(await findTelegramChats("test-only"), [
      { id: "-12345", label: "Test group" },
    ]);
  } finally {
    globalThis.fetch = original;
  }
});

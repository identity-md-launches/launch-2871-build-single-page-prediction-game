import test from "node:test";
import assert from "node:assert/strict";
import {
  bandFor,
  isFeedFresh,
  parseFeed,
  parseResults,
  REFUND_GRACE_MS,
  ROUND_MS,
  roundAt,
  uint,
  type RoundResult,
} from "../src/lib/api";
import {
  acceptDuel,
  cancelDuel,
  claimRelief,
  createDuel,
  emptyLeague,
  ensurePlayer,
  multiplierFor,
  parseLeague,
  placePrediction,
  settleLeague,
  weekStart,
  weeklyProfit,
  type PredictionInput,
} from "../src/lib/game";

const start = Date.UTC(2026, 10, 2, 10, 10);
const installation = "unit-test-only";
const input = (overrides: Partial<PredictionInput> = {}): PredictionInput => ({
  player: "alice",
  round: 2,
  installation,
  band: "run",
  stake: 100,
  now: start - 100_000,
  start,
  end: start + ROUND_MS,
  ...overrides,
});
const result = (round = 2, work = 300): RoundResult => ({
  round,
  work,
  band: bandFor(work),
  settledAt: start + ROUND_MS + 1000,
  source: "test",
});

test("four bands have exact boundary behavior", () => {
  assert.deepEqual([0, 1, 99, 100, 499, 500, 100_000].map(bandFor), [
    "sleep",
    "stroll",
    "stroll",
    "run",
    "run",
    "sprint",
    "sprint",
  ]);
});
test("API integers reject missing, fractional, negative and unsafe values", () => {
  assert.equal(uint("500"), 500);
  for (const n of [null, "", "-1", -1, "1.2", 1.2, {}, NaN, Infinity, 9e20])
    assert.equal(uint(n), undefined);
});
test("next round timing is anchored to official round data, including boundaries", () => {
  const anchor = { round: 7, startsAt: start, installation };
  assert.deepEqual(roundAt(anchor, start + ROUND_MS - 1), {
    current: 7,
    next: 8,
    nextStart: start + ROUND_MS,
    nextEnd: start + 2 * ROUND_MS,
  });
  assert.equal(roundAt(anchor, start + ROUND_MS).next, 9);
});
test("never distribute a nonzero batched settlement or use unsafe records", () => {
  const rows = [
    {
      settledThroughRound: "10",
      previousSettledThroughRound: "8",
      workAdded: "600",
      confirmationStatus: "safe",
    },
    {
      settledThroughRound: "11",
      previousSettledThroughRound: "10",
      workAdded: "500",
      confirmationStatus: "pending",
    },
    {
      settledThroughRound: "12",
      previousSettledThroughRound: "11",
      workAdded: "100",
      confirmationStatus: "safe",
    },
  ].map((s) => ({ ...s, blockTimestamp: new Date(start).toISOString() }));
  assert.deepEqual(
    parseResults({ status: "available", recentSettlements: rows }).map((r) => [
      r.round,
      r.work,
    ]),
    [[12, 100]],
  );
});
test("consecutive safe mining checkpoints provide exact sleep and active work", () => {
  const recentCheckpoints = [
    [10, 11, 1000],
    [11, 12, 1000],
    [12, 13, 1240],
    [15, 16, 2000],
  ].map(([afterRound, throughRound, cumulativeWork]) => ({
    afterRound,
    throughRound,
    cumulativeWork,
    confirmationStatus: "safe",
    blockTimestamp: new Date(start).toISOString(),
  }));
  assert.deepEqual(
    parseResults({ status: "available", mining: { recentCheckpoints } }).map(
      (r) => [r.round, r.work],
    ),
    [
      [13, 240],
      [12, 0],
    ],
  );
});
test("zero-work batches prove sleep, unavailable history proves nothing", () => {
  const recentSettlements = [
    {
      previousSettledThroughRound: 10,
      settledThroughRound: 13,
      workAdded: 0,
      confirmationStatus: "safe",
      blockTimestamp: new Date(start).toISOString(),
    },
  ];
  assert.deepEqual(
    parseResults({ status: "available", recentSettlements }).map((r) => r.work),
    [0, 0, 0],
  );
  assert.deepEqual(
    parseResults({ status: "unavailable", recentSettlements }),
    [],
  );
});
test("feed reads official nested fields, freshness and installation identity", () => {
  const status = {
    installationId: installation,
    generatedAt: new Date(start).toISOString(),
    measurement: {
      freshness: "online",
      coreStatus: "RUNNING",
      rpmMilli: 12500,
      speedMmPerSecond: 79,
      cumulativeWorkUnits: "1234",
      observedAt: new Date(start - 500).toISOString(),
    },
    builder: {
      anchor: { settledThroughRound: "6" },
      queued: { openRoundWorkUnits: "23" },
    },
  };
  const history = {
    status: "available",
    installationId: installation,
    mining: {
      nextRound: { round: "7", startsAt: new Date(start).toISOString() },
    },
  };
  const feed = parseFeed(status, history, start);
  assert.equal(feed.rpm, 12.5);
  assert.equal(feed.cumulativeWork, 1234);
  assert.equal(feed.openWork, 23);
  assert.ok(isFeedFresh(feed, start + 1000));
  assert.equal(isFeedFresh(feed, start + 91_000), false);
  assert.equal(
    isFeedFresh({ ...feed, generatedAt: start - 300_000 }, start + 1000),
    false,
  );
  assert.equal(
    parseFeed(status, { ...history, installationId: "other" }, start).anchor,
    null,
  );
});
test("a prediction reserves the stake once and forbids duplicates", () => {
  const league = emptyLeague();
  placePrediction(league, input());
  assert.equal(league.players.alice.balance, 900);
  assert.throws(() => placePrediction(league, input()), /already/);
  assert.equal(league.predictions.length, 1);
});
test("history can settle pending picks while wheel status is unavailable, without enabling new picks", () => {
  const history = {
    installationId: installation,
    status: "available",
    generatedAt: new Date(start).toISOString(),
    mining: {
      nextRound: { round: "2", startsAt: new Date(start).toISOString() },
    },
    recentSettlements: [
      {
        settledThroughRound: "2",
        previousSettledThroughRound: "1",
        workAdded: "300",
        confirmationStatus: "safe",
        blockTimestamp: new Date(start + ROUND_MS).toISOString(),
      },
    ],
  };
  const feed = parseFeed(null, history, start);
  assert.equal(feed.statusAvailable, false);
  assert.equal(feed.rpm, undefined);
  assert.equal(isFeedFresh(feed, start), false);
  assert.equal(feed.results[0].work, 300);
  const malformedStatus = parseFeed(
    {
      measurement: { rpmMilli: 25000 },
      builder: { queued: { openRoundWorkUnits: 42 } },
    },
    history,
    start,
  );
  assert.equal(malformedStatus.rpm, undefined);
  assert.equal(malformedStatus.openWork, undefined);
  const league = emptyLeague();
  placePrediction(league, input());
  settleLeague(
    league,
    feed.results,
    start + ROUND_MS + 1000,
    feed.installation,
  );
  assert.equal(league.players.alice.balance, 1100);
});
test("reject closed rounds, fractional stakes, overdrafts and wrong time windows", () => {
  for (const overrides of [
    { stake: 9 },
    { stake: 501 },
    { stake: 10.5 },
    { now: start },
    { end: start + 20 },
    { now: start - 700_000 },
  ])
    assert.throws(() => placePrediction(emptyLeague(), input(overrides)));
  const league = emptyLeague();
  ensurePlayer(league, "alice").balance = 10;
  assert.throws(() => placePrediction(league, input()), /balance/);
});
test("correct solo pick pays stake-inclusive return and settles idempotently", () => {
  const league = emptyLeague();
  placePrediction(league, input());
  settleLeague(league, [result()], start + ROUND_MS + 2000, installation);
  assert.equal(league.players.alice.balance, 1100);
  assert.equal(league.players.alice.streak, 1);
  settleLeague(league, [result()], start + ROUND_MS + 3000, installation);
  assert.equal(league.players.alice.balance, 1100);
});
test("consecutive wins escalate and cap the multiplier; loss resets it", () => {
  const league = emptyLeague();
  for (let i = 0; i < 6; i++) {
    const timing = {
      round: i + 2,
      now: start + i * ROUND_MS - 1000,
      start: start + i * ROUND_MS,
      end: start + (i + 1) * ROUND_MS,
    };
    placePrediction(league, input(timing));
    settleLeague(league, [result(i + 2)], timing.end + 1000, installation);
  }
  assert.deepEqual(
    league.predictions.map((p) => p.multiplier),
    [2, 2.25, 2.5, 2.75, 3, 3],
  );
  assert.equal(league.players.alice.bestStreak, 6);
  placePrediction(
    league,
    input({
      round: 8,
      now: start + 6 * ROUND_MS - 1000,
      start: start + 6 * ROUND_MS,
      end: start + 7 * ROUND_MS,
    }),
  );
  settleLeague(
    league,
    [result(8, 0)],
    start + 7 * ROUND_MS + 1000,
    installation,
  );
  assert.equal(league.players.alice.streak, 0);
  assert.equal(multiplierFor(0), 2);
});
test("missing round waits for grace, refunds fully and preserves streak", () => {
  const league = emptyLeague();
  ensurePlayer(league, "alice").streak = 3;
  placePrediction(league, input());
  settleLeague(
    league,
    [],
    start + ROUND_MS + REFUND_GRACE_MS - 1,
    installation,
  );
  assert.equal(league.predictions[0].outcome, "pending");
  settleLeague(league, [], start + ROUND_MS + REFUND_GRACE_MS, installation);
  assert.equal(league.predictions[0].outcome, "refunded");
  assert.equal(league.players.alice.balance, 1000);
  assert.equal(league.players.alice.streak, 3);
  settleLeague(
    league,
    [result()],
    start + ROUND_MS + REFUND_GRACE_MS + 1,
    installation,
  );
  assert.equal(league.predictions[0].outcome, "refunded");
});
test("missing data refunds even while both endpoints are unavailable", () => {
  const league = emptyLeague();
  placePrediction(league, input());
  settleLeague(league, [], start + ROUND_MS + REFUND_GRACE_MS);
  assert.equal(league.players.alice.balance, 1000);
});
test("changed installations refund, never settle a different installation’s round", () => {
  const league = emptyLeague();
  placePrediction(league, input());
  settleLeague(
    league,
    [result()],
    start + ROUND_MS + 1000,
    "other-installation",
  );
  assert.equal(league.predictions[0].outcome, "refunded");
});
test("pending earlier picks order one player’s streak but do not block another player", () => {
  const league = emptyLeague();
  placePrediction(league, input());
  placePrediction(
    league,
    input({
      round: 3,
      now: start + ROUND_MS - 1000,
      start: start + ROUND_MS,
      end: start + 2 * ROUND_MS,
    }),
  );
  placePrediction(
    league,
    input({
      player: "bob",
      round: 3,
      now: start + ROUND_MS - 1000,
      start: start + ROUND_MS,
      end: start + 2 * ROUND_MS,
    }),
  );
  settleLeague(league, [result(3)], start + 2 * ROUND_MS + 1000, installation);
  assert.equal(league.predictions[0].outcome, "pending");
  assert.equal(league.predictions[1].outcome, "pending");
  assert.equal(league.predictions[2].outcome, "won");
});
test("two-wallet duel escrows equal stakes and pays the winning pot", () => {
  const league = emptyLeague();
  const duel = createDuel(league, input());
  acceptDuel(league, duel.id, "bob", "sleep", start - 50_000);
  assert.equal(league.players.alice.balance, 900);
  assert.equal(league.players.bob.balance, 900);
  settleLeague(league, [result()], start + ROUND_MS + 1000, installation);
  assert.equal(league.players.alice.balance, 1100);
  assert.equal(league.players.bob.balance, 900);
  assert.equal(league.players.alice.streak, 0);
  assert.equal(duel.status, "settled");
});
test("duels refuse guests, self-matches, same bands and late acceptance", () => {
  const league = emptyLeague();
  assert.throws(() => createDuel(league, input({ player: "guest" })), /wallet/);
  const duel = createDuel(league, input());
  assert.throws(
    () => acceptDuel(league, duel.id, "alice", "sleep", start - 10),
    /second wallet/,
  );
  assert.throws(
    () => acceptDuel(league, duel.id, "bob", "run", start - 10),
    /different band/,
  );
  assert.throws(
    () => acceptDuel(league, duel.id, "bob", "sleep", start),
    /closed/,
  );
});
test("neither correct in a duel returns both stakes", () => {
  const league = emptyLeague();
  const duel = createDuel(league, input());
  acceptDuel(league, duel.id, "bob", "sleep", start - 50_000);
  settleLeague(league, [result(2, 600)], start + ROUND_MS + 1000, installation);
  assert.equal(league.players.alice.balance, 1000);
  assert.equal(league.players.bob.balance, 1000);
  assert.ok(league.predictions.every((p) => p.outcome === "refunded"));
});
test("unmatched, cancelled and missing-data duels refund without duplicating credit", () => {
  for (const scenario of ["unmatched", "cancelled", "missing"]) {
    const league = emptyLeague();
    const duel = createDuel(league, input());
    if (scenario === "cancelled")
      cancelDuel(league, duel.id, "alice", start - 10);
    if (scenario === "missing")
      acceptDuel(league, duel.id, "bob", "sleep", start - 20);
    const now =
      scenario === "missing" ? start + ROUND_MS + REFUND_GRACE_MS : start;
    settleLeague(league, [], now, installation);
    settleLeague(league, [], now + 1, installation);
    assert.equal(league.players.alice.balance, 1000);
    if (scenario === "missing") assert.equal(league.players.bob.balance, 1000);
  }
});
test("relief is 300 SP below threshold, once per UTC day and outside profit", () => {
  const league = emptyLeague();
  ensurePlayer(league, "alice").balance = 299;
  claimRelief(league, "alice", start);
  assert.equal(league.players.alice.balance, 599);
  assert.equal(weeklyProfit(league, "alice", start), 0);
  league.players.alice.balance = 100;
  assert.throws(() => claimRelief(league, "alice", start), /already/);
  claimRelief(league, "alice", start + 86_400_000);
  assert.equal(league.players.alice.balance, 400);
});
test("weekly profit uses settled net only and resets Monday UTC", () => {
  const league = emptyLeague();
  placePrediction(league, input());
  assert.equal(weeklyProfit(league, "alice", start), 0);
  settleLeague(league, [result()], start + ROUND_MS + 1000, installation);
  assert.equal(weeklyProfit(league, "alice", start + ROUND_MS + 1000), 100);
  assert.equal(weekStart(start), Date.UTC(2026, 10, 2));
  assert.equal(weeklyProfit(league, "alice", start + 7 * 86_400_000), 0);
});
test("malformed saved data fails closed; valid state roundtrips", () => {
  assert.throws(() => parseLeague("{"));
  assert.throws(() =>
    parseLeague(
      JSON.stringify({ version: 2, players: {}, predictions: [], duels: [] }),
    ),
  );
  const league = emptyLeague();
  placePrediction(league, input());
  assert.deepEqual(parseLeague(JSON.stringify(league)), league);
});

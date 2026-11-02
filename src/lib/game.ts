import { bandFor, REFUND_GRACE_MS, type Band, type RoundResult } from "./api";

export const STORAGE_KEY = "squeek-streak:league:v1";
export type Outcome = "pending" | "won" | "lost" | "refunded";
export interface Prediction {
  id: string;
  player: string;
  round: number;
  installation: string;
  start: number;
  end: number;
  band: Band;
  stake: number;
  createdAt: number;
  outcome: Outcome;
  payout: number;
  multiplier: number;
  work?: number;
  settledAt?: number;
  reason?: string;
  duelId?: string;
}
export interface Player {
  id: string;
  name: string;
  balance: number;
  streak: number;
  bestStreak: number;
  lastRelief?: string;
}
export interface Duel {
  id: string;
  host: string;
  guest?: string;
  round: number;
  installation: string;
  start: number;
  end: number;
  stake: number;
  band: Band;
  status: "open" | "matched" | "settled" | "cancelled";
}
export interface League {
  version: 1;
  players: Record<string, Player>;
  predictions: Prediction[];
  duels: Duel[];
}
export const emptyLeague = (): League => ({
  version: 1,
  players: {},
  predictions: [],
  duels: [],
});
export function ensurePlayer(league: League, id: string): Player {
  return (league.players[id] ??= {
    id,
    name: id === "guest" ? "Seedling" : `Hamster ${id.slice(2, 6)}`,
    balance: 1000,
    streak: 0,
    bestStreak: 0,
  });
}
export const multiplierFor = (streak: number) =>
  Math.min(3, 2 + Math.max(0, streak) * 0.25);
export const utcDay = (now: number) => new Date(now).toISOString().slice(0, 10);
export function weekStart(now: number) {
  const date = new Date(now);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.getTime();
}
export function weeklyProfit(league: League, player: string, now: number) {
  return league.predictions
    .filter(
      (p) =>
        p.player === player &&
        p.outcome !== "pending" &&
        (p.settledAt ?? 0) >= weekStart(now),
    )
    .reduce((sum, p) => sum + p.payout - p.stake, 0);
}
export interface PredictionInput {
  player: string;
  round: number;
  installation: string;
  start: number;
  end: number;
  band: Band;
  stake: number;
  now: number;
}
function validate(league: League, input: PredictionInput) {
  const p = ensurePlayer(league, input.player);
  if (!["sleep", "stroll", "run", "sprint"].includes(input.band))
    throw new Error("Choose one of the four work bands.");
  if (!Number.isInteger(input.stake) || input.stake < 10 || input.stake > 500)
    throw new Error("Enter a whole stake from 10 to 500 SP.");
  if (input.stake > p.balance)
    throw new Error(
      "Your stake exceeds your balance. Choose a smaller stake or check daily relief.",
    );
  if (
    input.now >= input.start ||
    input.start - input.now > 600_000 ||
    input.end - input.start !== 600_000
  )
    throw new Error("This round has closed. Choose the next round.");
  if (
    league.predictions.some(
      (p) =>
        p.player === input.player &&
        p.round === input.round &&
        p.installation === input.installation,
    )
  )
    throw new Error("You already have a prediction for this round.");
  return p;
}
const id = () => crypto.randomUUID();
function prediction(input: PredictionInput): Prediction {
  const { now, ...rest } = input;
  return {
    ...rest,
    id: id(),
    createdAt: now,
    outcome: "pending",
    payout: 0,
    multiplier: 2,
  };
}
export function placePrediction(league: League, input: PredictionInput) {
  const player = validate(league, input);
  player.balance -= input.stake;
  league.predictions.push(prediction(input));
}
export function createDuel(league: League, input: PredictionInput) {
  if (input.player === "guest")
    throw new Error("Sign in with a wallet to create a duel.");
  const player = validate(league, input);
  const duel: Duel = {
    id: id(),
    host: input.player,
    round: input.round,
    installation: input.installation,
    start: input.start,
    end: input.end,
    stake: input.stake,
    band: input.band,
    status: "open",
  };
  player.balance -= input.stake;
  league.duels.push(duel);
  league.predictions.push({ ...prediction(input), duelId: duel.id });
  return duel;
}
export function acceptDuel(
  league: League,
  duelId: string,
  playerId: string,
  band: Band,
  now: number,
) {
  const duel = league.duels.find((d) => d.id === duelId);
  if (!duel || duel.status !== "open")
    throw new Error("This duel is no longer open. Choose another duel.");
  if (playerId === "guest" || playerId === duel.host)
    throw new Error("A second wallet must sign in to accept this duel.");
  if (band === duel.band)
    throw new Error("Choose a different band from your opponent.");
  const input: PredictionInput = {
    player: playerId,
    round: duel.round,
    installation: duel.installation,
    start: duel.start,
    end: duel.end,
    stake: duel.stake,
    band,
    now,
  };
  const player = validate(league, input);
  player.balance -= duel.stake;
  duel.guest = playerId;
  duel.status = "matched";
  league.predictions.push({ ...prediction(input), duelId });
}
export function cancelDuel(
  league: League,
  duelId: string,
  playerId: string,
  now: number,
) {
  const duel = league.duels.find((d) => d.id === duelId);
  if (!duel || duel.host !== playerId || duel.status !== "open")
    throw new Error("Only an unmatched duel can be cancelled by its creator.");
  const entry = league.predictions.find((p) => p.duelId === duelId);
  if (entry?.outcome === "pending")
    finish(
      league,
      entry,
      "refunded",
      entry.stake,
      now,
      undefined,
      "Duel cancelled",
    );
  duel.status = "cancelled";
}
function finish(
  league: League,
  p: Prediction,
  outcome: Outcome,
  payout: number,
  now: number,
  work?: number,
  reason?: string,
) {
  if (p.outcome !== "pending") return;
  const player = ensurePlayer(league, p.player);
  p.outcome = outcome;
  p.payout = payout;
  p.settledAt = now;
  p.work = work;
  p.reason = reason;
  player.balance += payout;
  // Duels do not affect the solo streak; refunds preserve it.
  if (!p.duelId && outcome === "won") {
    player.streak++;
    player.bestStreak = Math.max(player.bestStreak, player.streak);
  } else if (!p.duelId && outcome === "lost") player.streak = 0;
}
export function settleLeague(
  league: League,
  results: RoundResult[],
  now: number,
  installation?: string,
) {
  const byRound = new Map(results.map((r) => [r.round, r]));
  const pending = league.predictions
    .filter((p) => p.outcome === "pending")
    .sort((a, b) => a.end - b.end || a.createdAt - b.createdAt);
  const waitingPlayers = new Set<string>();
  for (const p of pending) {
    if (p.outcome !== "pending") continue;
    if (!p.duelId && waitingPlayers.has(p.player)) continue;
    const wrongInstallation = !!installation && p.installation !== installation;
    const confirmed =
      !wrongInstallation && installation === p.installation
        ? byRound.get(p.round)
        : undefined;
    // A timely API confirmation remains valid when the player returns after grace.
    const result =
      confirmed && confirmed.settledAt <= p.end + REFUND_GRACE_MS
        ? confirmed
        : undefined;
    const duel = p.duelId && league.duels.find((d) => d.id === p.duelId);
    if (duel) {
      const entries = league.predictions.filter((e) => e.duelId === duel.id);
      if (duel.status === "open" && now >= duel.start) {
        entries.forEach((e) =>
          finish(
            league,
            e,
            "refunded",
            e.stake,
            now,
            undefined,
            "No opponent joined before the round started",
          ),
        );
        duel.status = "cancelled";
      } else if (result && now >= p.end && duel.status === "matched") {
        const winner = entries.find((e) => e.band === result.band);
        entries.forEach((e) =>
          finish(
            league,
            e,
            winner ? (e === winner ? "won" : "lost") : "refunded",
            winner ? (e === winner ? duel.stake * 2 : 0) : e.stake,
            now,
            result.work,
            winner
              ? "Duel settled"
              : "Neither prediction matched; both stakes returned",
          ),
        );
        duel.status = "settled";
      } else if (wrongInstallation || now >= p.end + REFUND_GRACE_MS) {
        entries.forEach((e) =>
          finish(
            league,
            e,
            "refunded",
            e.stake,
            now,
            undefined,
            "Round data unavailable within 20 minutes",
          ),
        );
        duel.status = "settled";
      }
    } else if (wrongInstallation)
      finish(
        league,
        p,
        "refunded",
        p.stake,
        now,
        undefined,
        "The API installation changed",
      );
    else if (result && now >= p.end) {
      const player = ensurePlayer(league, p.player);
      p.multiplier = multiplierFor(player.streak);
      const won = p.band === bandFor(result.work);
      finish(
        league,
        p,
        won ? "won" : "lost",
        won ? Math.floor(p.stake * p.multiplier) : 0,
        now,
        result.work,
      );
    } else if (now >= p.end + REFUND_GRACE_MS)
      finish(
        league,
        p,
        "refunded",
        p.stake,
        now,
        undefined,
        "Round data unavailable within 20 minutes",
      );
    // A missing earlier outcome must not let later solo wins pay a premature multiplier.
    if (!p.duelId && p.outcome === "pending") waitingPlayers.add(p.player);
  }
}
export function claimRelief(league: League, playerId: string, now: number) {
  const p = ensurePlayer(league, playerId);
  if (p.balance >= 300)
    throw new Error(
      "Daily relief becomes available when your balance drops below 300 SP.",
    );
  if (p.lastRelief === utcDay(now))
    throw new Error(
      "Today’s relief is already claimed. It resets at 00:00 UTC.",
    );
  p.balance += 300;
  p.lastRelief = utcDay(now);
}
export function parseLeague(raw: string | null): League {
  if (!raw) return emptyLeague();
  const v = JSON.parse(raw) as League;
  if (
    v.version !== 1 ||
    !v.players ||
    typeof v.players !== "object" ||
    !Array.isArray(v.predictions) ||
    !Array.isArray(v.duels)
  )
    throw new Error("Saved league data is not supported.");
  for (const p of Object.values(v.players)) {
    if (
      !p ||
      typeof p.id !== "string" ||
      typeof p.name !== "string" ||
      !Number.isSafeInteger(p.balance) ||
      p.balance < 0 ||
      !Number.isSafeInteger(p.streak)
    )
      throw new Error("Saved player data is invalid.");
  }
  for (const p of v.predictions) {
    if (
      !p ||
      !v.players[p.player] ||
      !Number.isSafeInteger(p.round) ||
      !Number.isSafeInteger(p.stake) ||
      p.stake < 10 ||
      p.stake > 500 ||
      !["pending", "won", "lost", "refunded"].includes(p.outcome) ||
      !["sleep", "stroll", "run", "sprint"].includes(p.band) ||
      !Number.isFinite(p.end)
    )
      throw new Error("Saved prediction data is invalid.");
  }
  for (const d of v.duels)
    if (
      !d ||
      !v.players[d.host] ||
      !Number.isFinite(d.start) ||
      !Number.isFinite(d.end) ||
      !["open", "matched", "settled", "cancelled"].includes(d.status)
    )
      throw new Error("Saved duel data is invalid.");
  return v;
}

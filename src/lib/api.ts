export const API = "https://api.squeekchain.com/v1";
export const ROUND_MS = 600_000;
export const REFUND_GRACE_MS = 1_200_000;
export type Band = "sleep" | "stroll" | "run" | "sprint";
export const BANDS: {
  id: Band;
  name: string;
  range: string;
  description: string;
}[] = [
  { id: "sleep", name: "Sleep", range: "0", description: "Dreaming of seeds" },
  {
    id: "stroll",
    name: "Stroll",
    range: "1–99",
    description: "A little leg stretch",
  },
  { id: "run", name: "Run", range: "100–499", description: "Finding a rhythm" },
  {
    id: "sprint",
    name: "Sprint",
    range: "500+",
    description: "Full hamster power",
  },
];
export const bandFor = (work: number): Band =>
  work === 0 ? "sleep" : work < 100 ? "stroll" : work < 500 ? "run" : "sprint";
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};
export const uint = (v: unknown): number | undefined => {
  if (typeof v !== "number" && (typeof v !== "string" || !/^\d+$/.test(v)))
    return undefined;
  const n = Number(v);
  return Number.isSafeInteger(n) && n >= 0 ? n : undefined;
};
const timestamp = (v: unknown) => (typeof v === "string" ? Date.parse(v) : NaN);
export interface RoundResult {
  round: number;
  work: number;
  band: Band;
  settledAt: number;
  source: string;
}
export interface RoundAnchor {
  round: number;
  startsAt: number;
  installation: string;
}
export interface Feed {
  statusAvailable: boolean;
  installation: string;
  generatedAt: number;
  receivedAt: number;
  serverOffset: number;
  coreStatus: string;
  freshness: string;
  observedAt: number;
  staleAfter: number;
  rpm: number | undefined;
  speed: number | undefined;
  cumulativeWork: number | undefined;
  openWork: number | undefined;
  settledThrough: number | undefined;
  anchor: RoundAnchor | null;
  results: RoundResult[];
  historyAvailable: boolean;
}
export function parseResults(payload: unknown): RoundResult[] {
  const data = obj(payload);
  const found = new Map<number, RoundResult>();
  if (data.status !== "available") return [];
  const settlements = Array.isArray(data.recentSettlements)
    ? data.recentSettlements
    : [];
  for (const raw of settlements) {
    const s = obj(raw);
    const end = uint(s.settledThroughRound),
      prev = uint(s.previousSettledThroughRound),
      work = uint(s.workAdded);
    const at = timestamp(s.blockTimestamp);
    if (
      s.confirmationStatus !== "safe" ||
      end === undefined ||
      prev === undefined ||
      work === undefined ||
      !Number.isFinite(at) ||
      end <= prev
    )
      continue;
    // Nonzero batched work cannot be assigned to individual rounds.
    if (end - prev === 1)
      found.set(end, {
        round: end,
        work,
        band: bandFor(work),
        settledAt: at,
        source: "settlement",
      });
    else if (work === 0 && end - prev <= 144) {
      for (let round = prev + 1; round <= end; round++)
        found.set(round, {
          round,
          work: 0,
          band: "sleep",
          settledAt: at,
          source: "zero-work settlement",
        });
    }
  }
  const mining = obj(data.mining);
  const checkpoints = (
    Array.isArray(mining.recentCheckpoints) ? mining.recentCheckpoints : []
  )
    .map(obj)
    .filter((c) => c.confirmationStatus === "safe");
  const byRound = new Map(checkpoints.map((c) => [uint(c.throughRound), c]));
  for (const c of checkpoints) {
    const end = uint(c.throughRound),
      prev = uint(c.afterRound),
      cumulative = uint(c.cumulativeWork);
    const prior = byRound.get(prev),
      before = prior && uint(prior.cumulativeWork),
      at = timestamp(c.blockTimestamp);
    if (
      end === undefined ||
      prev === undefined ||
      end !== prev + 1 ||
      cumulative === undefined ||
      before === undefined ||
      cumulative < before ||
      !Number.isFinite(at)
    )
      continue;
    if (!found.has(end)) {
      const work = cumulative - before;
      found.set(end, {
        round: end,
        work,
        band: bandFor(work),
        settledAt: at,
        source: "consecutive safe checkpoints",
      });
    }
  }
  return [...found.values()].sort((a, b) => b.round - a.round);
}
export function parseFeed(
  statusPayload: unknown,
  historyPayload: unknown,
  receivedAt = Date.now(),
): Feed {
  const status = obj(statusPayload),
    history = obj(historyPayload),
    measurement = obj(status.measurement);
  const builder = obj(status.builder),
    anchor = obj(builder.anchor),
    queued = obj(builder.queued);
  const mining = obj(history.mining),
    next = obj(mining.nextRound);
  const statusAvailable =
    typeof status.installationId === "string" &&
    !!status.installationId &&
    Number.isFinite(timestamp(status.generatedAt)) &&
    Object.keys(measurement).length > 0;
  const historyUsable =
    history.status === "available" &&
    typeof history.installationId === "string" &&
    !!history.installationId &&
    Number.isFinite(timestamp(history.generatedAt));
  const installation = statusAvailable
    ? String(status.installationId)
    : historyUsable
      ? String(history.installationId)
      : "";
  const generatedAt = timestamp(
      statusAvailable ? status.generatedAt : history.generatedAt,
    ),
    startsAt = timestamp(next.startsAt),
    round = uint(next.round);
  if (!installation || !Number.isFinite(generatedAt))
    throw new Error(
      "The live feed returned an unsupported response. Try again shortly.",
    );
  const sameInstallation = history.installationId === installation;
  return {
    statusAvailable,
    // Round boundaries use the device UTC clock. A cached generatedAt must never
    // rewind the countdown or reopen a round each time the same payload is fetched.
    installation,
    generatedAt,
    receivedAt,
    serverOffset: 0,
    coreStatus:
      statusAvailable && typeof measurement.coreStatus === "string"
        ? measurement.coreStatus
        : "UNKNOWN",
    freshness:
      statusAvailable && typeof measurement.freshness === "string"
        ? measurement.freshness
        : "offline",
    observedAt: statusAvailable ? timestamp(measurement.observedAt) : NaN,
    staleAfter: (uint(measurement.staleAfterSeconds) ?? 120) * 1000,
    rpm:
      !statusAvailable || uint(measurement.rpmMilli) === undefined
        ? undefined
        : Number(measurement.rpmMilli) / 1000,
    speed: statusAvailable ? uint(measurement.speedMmPerSecond) : undefined,
    cumulativeWork: statusAvailable
      ? uint(measurement.cumulativeWorkUnits)
      : undefined,
    openWork: statusAvailable ? uint(queued.openRoundWorkUnits) : undefined,
    settledThrough: statusAvailable
      ? uint(anchor.settledThroughRound)
      : undefined,
    anchor:
      sameInstallation &&
      history.status === "available" &&
      round !== undefined &&
      round > 0 &&
      Number.isFinite(startsAt)
        ? { round, startsAt, installation }
        : null,
    results: sameInstallation ? parseResults(history) : [],
    historyAvailable: sameInstallation && history.status === "available",
  };
}
export function roundAt(anchor: RoundAnchor, now: number) {
  const shift = Math.floor((now - anchor.startsAt) / ROUND_MS);
  const current = anchor.round + shift;
  const currentStart = anchor.startsAt + shift * ROUND_MS;
  return {
    current,
    next: current + 1,
    nextStart: currentStart + ROUND_MS,
    nextEnd: currentStart + 2 * ROUND_MS,
  };
}
export function isFeedFresh(feed: Feed | null, clientNow = Date.now()) {
  if (
    !feed ||
    !feed.statusAvailable ||
    !feed.anchor ||
    !feed.historyAvailable ||
    feed.freshness !== "online"
  )
    return false;
  const serverNow = clientNow + feed.serverOffset;
  return (
    clientNow - feed.receivedAt < 90_000 &&
    Math.abs(clientNow - feed.generatedAt) < 120_000 &&
    Number.isFinite(feed.observedAt) &&
    serverNow - feed.observedAt <= feed.staleAfter
  );
}
async function get(path: string, signal: AbortSignal) {
  const response = await fetch(`${API}/${path}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok)
    throw new Error(
      `Squeekchain returned ${response.status}. Try the feed again shortly.`,
    );
  return response.json() as Promise<unknown>;
}
export async function fetchFeed(signal: AbortSignal): Promise<Feed> {
  const [status, history] = await Promise.allSettled([
    get("status", signal),
    get("settlements?range=24h", signal),
  ]);
  return parseFeed(
    status.status === "fulfilled" ? status.value : null,
    history.status === "fulfilled" ? history.value : null,
  );
}

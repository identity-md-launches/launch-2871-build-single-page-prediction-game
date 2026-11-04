export const API = "https://api.squeekchain.com/v1";
export const POLL_MS = 15_000;
export const MAX_GAP_MS = 45_000;

type Obj = Record<string, unknown>;
export const object = (value: unknown): Obj =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Obj)
    : {};
export const uint = (value: unknown): number | undefined => {
  if (
    typeof value !== "number" &&
    (typeof value !== "string" || !/^\d+$/.test(value))
  )
    return undefined;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : undefined;
};
const time = (value: unknown) =>
  typeof value === "string" ? Date.parse(value) : NaN;

export interface WheelStatus {
  installation: string;
  rpm: number;
  openWork?: number;
  coreStatus: string;
  observedAt: number;
  staleAfter: number;
  generatedAt: number;
  receivedAt: number;
}
export interface Settlement {
  from: number;
  through: number;
  work?: number;
  at: number;
}
export interface History {
  installation: string;
  settlements: Settlement[];
  currentRound?: number;
  generatedAt: number;
}
function envelope(data: Obj, now: number) {
  if (
    typeof data.installationId !== "string" ||
    !data.installationId ||
    !Number.isFinite(time(data.generatedAt))
  )
    throw new Error(
      "The API response has an unsupported format. Retrying every 15 seconds.",
    );
  if (Math.abs(now - time(data.generatedAt)) > 120_000)
    throw new Error(
      "The feed timestamp is out of date. Check your device clock; retrying every 15 seconds.",
    );
}
export function parseStatus(payload: unknown, now = Date.now()): WheelStatus {
  const data = object(payload),
    measurement = object(data.measurement);
  envelope(data, now);
  const rpmMilli = uint(measurement.rpmMilli),
    observedAt = time(measurement.observedAt);
  const staleAfter = (uint(measurement.staleAfterSeconds) ?? 120) * 1000;
  if (rpmMilli === undefined || !Number.isFinite(observedAt))
    throw new Error(
      "Wheel measurements are missing. Retrying every 15 seconds.",
    );
  if (
    measurement.freshness !== "online" ||
    now - observedAt > staleAfter ||
    observedAt - now > 120_000
  )
    throw new Error(
      "The wheel sensor is offline or stale. Alerts resume after fresh measurements return.",
    );
  const builder = object(data.builder);
  return {
    installation: String(data.installationId),
    rpm: rpmMilli / 1000,
    openWork:
      builder.status === "available"
        ? uint(object(builder.queued).openRoundWorkUnits)
        : undefined,
    coreStatus:
      typeof measurement.coreStatus === "string"
        ? measurement.coreStatus
        : "Unknown",
    observedAt,
    staleAfter,
    generatedAt: time(data.generatedAt),
    receivedAt: now,
  };
}
export function parseHistory(payload: unknown, now = Date.now()): History {
  const data = object(payload);
  envelope(data, now);
  if (data.status !== "available")
    throw new Error("Round history is unavailable. Retrying every 15 seconds.");
  const settlements: Settlement[] = [];
  for (const raw of Array.isArray(data.recentSettlements)
    ? data.recentSettlements
    : []) {
    const record = object(raw),
      through = uint(record.settledThroughRound),
      previous = uint(record.previousSettledThroughRound),
      at = time(record.blockTimestamp);
    if (
      record.confirmationStatus === "safe" &&
      through !== undefined &&
      previous !== undefined &&
      through > previous &&
      Number.isFinite(at)
    )
      settlements.push({
        from: previous + 1,
        through,
        work: uint(record.workAdded),
        at,
      });
  }
  const mining = object(data.mining);
  // Checkpoints include zero-work rounds absent from recent active settlements.
  for (const raw of Array.isArray(mining.recentCheckpoints)
    ? mining.recentCheckpoints
    : []) {
    const record = object(raw),
      through = uint(record.throughRound),
      previous = uint(record.afterRound),
      at = time(record.blockTimestamp);
    if (
      record.confirmationStatus === "safe" &&
      through !== undefined &&
      previous !== undefined &&
      through > previous &&
      Number.isFinite(at)
    )
      settlements.push({ from: previous + 1, through, at });
  }
  settlements.sort(
    (a, b) =>
      a.through - b.through ||
      a.from - b.from ||
      Number(b.work !== undefined) - Number(a.work !== undefined),
  );
  return {
    installation: String(data.installationId),
    settlements,
    currentRound: uint(object(mining.nextRound).round),
    generatedAt: time(data.generatedAt),
  };
}
export async function getJSON(
  path: string,
  signal: AbortSignal,
): Promise<unknown> {
  const response = await fetch(`${API}/${path}`, {
    signal,
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    headers: { Accept: "application/json" },
  });
  if (!response.ok)
    throw new Error(
      `Squeekchain returned HTTP ${response.status}. Retrying every 15 seconds.`,
    );
  return response.json();
}

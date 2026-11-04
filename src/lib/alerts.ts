import { MAX_GAP_MS, type History, type WheelStatus } from "./api";
export type Trigger = "wake" | "sleep" | "round" | "threshold";
export interface Rules {
  wake: boolean;
  sleep: boolean;
  round: boolean;
  threshold: boolean;
  rpmTarget: number;
}
export const DEFAULT_RULES: Rules = {
  wake: true,
  sleep: true,
  round: true,
  threshold: true,
  rpmTarget: 500,
};
export interface AlertEvent {
  kind: Trigger | "test";
  title: string;
  message: string;
  at: number;
}
export interface WheelMemory {
  previous: WheelStatus | null;
  zeroSince: number | null;
  sleepSent: boolean;
  target: number;
  sleepEnabled: boolean;
}
export const newWheelMemory = (): WheelMemory => ({
  previous: null,
  zeroSince: null,
  sleepSent: false,
  target: 500,
  sleepEnabled: true,
});
export function observeWheel(
  memory: WheelMemory,
  current: WheelStatus,
  rules: Rules,
  now: number,
): { memory: WheelMemory; events: AlertEvent[] } {
  const previous = memory.previous;
  const next = {
    ...memory,
    previous: current,
    target: rules.rpmTarget,
    sleepEnabled: rules.sleep,
  };
  const events: AlertEvent[] = [];
  const event = (kind: Trigger, title: string, detail: string) =>
    events.push({
      kind,
      title,
      message: `Squeek Alert Lab\n${title}\n${detail}\nObserved ${new Date(now).toISOString()}`,
      at: now,
    });
  if (
    !previous ||
    previous.installation !== current.installation ||
    now - previous.receivedAt > MAX_GAP_MS ||
    current.observedAt < previous.observedAt
  )
    return { memory: { ...next, zeroSince: null, sleepSent: false }, events };
  if (previous.rpm === 0 && current.rpm > 0 && rules.wake)
    event(
      "wake",
      "Hamster wake-up",
      `The wheel is running at ${current.rpm} RPM.`,
    );
  if (current.rpm > 0) {
    next.zeroSince = null;
    next.sleepSent = false;
  } else if (previous.rpm > 0) {
    next.zeroSince = now;
    next.sleepSent = false;
  }
  if (!rules.sleep) {
    next.zeroSince = null;
    next.sleepSent = false;
  }
  if (
    rules.sleep &&
    next.zeroSince !== null &&
    !next.sleepSent &&
    now - next.zeroSince >= 300_000
  ) {
    event(
      "sleep",
      "Hamster sleep",
      "The wheel has stayed at 0 RPM for at least 5 minutes of observed polls.",
    );
    next.sleepSent = true;
  }
  if (rules.threshold && memory.target === rules.rpmTarget) {
    if (previous.rpm < rules.rpmTarget && current.rpm >= rules.rpmTarget)
      event(
        "threshold",
        "RPM target crossed upward",
        `${previous.rpm} → ${current.rpm} RPM. Target: ${rules.rpmTarget} RPM.`,
      );
    else if (previous.rpm >= rules.rpmTarget && current.rpm < rules.rpmTarget)
      event(
        "threshold",
        "RPM target crossed downward",
        `${previous.rpm} → ${current.rpm} RPM. Target: ${rules.rpmTarget} RPM.`,
      );
  }
  return { memory: next, events };
}
export interface RoundMemory {
  installation: string;
  through: number | null;
}
export const newRoundMemory = (): RoundMemory => ({
  installation: "",
  through: null,
});
export function observeRounds(
  memory: RoundMemory,
  history: History,
  enabled: boolean,
  now: number,
): { memory: RoundMemory; events: AlertEvent[] } {
  const newest = history.settlements.at(-1)?.through;
  if (memory.installation !== history.installation || memory.through === null)
    return {
      memory: { installation: history.installation, through: newest ?? null },
      events: [],
    };
  let through = memory.through;
  const events: AlertEvent[] = [];
  for (const record of history.settlements) {
    if (record.through <= through) continue;
    const from = Math.max(record.from, through + 1);
    if (enabled) {
      const title =
        from === record.through
          ? `Round #${from} settled`
          : `Rounds #${from}–${record.through} settled`;
      const work =
        record.work !== undefined && from === record.from
          ? `\n${record.work} work units${record.from !== record.through ? " across this batch" : ""}.`
          : "";
      events.push({
        kind: "round",
        title,
        message: `Squeek Alert Lab\n${title}${work}\nConfirmed by Squeekchain.\nObserved ${new Date(now).toISOString()}`,
        at: now,
      });
    }
    through = record.through;
  }
  return { memory: { installation: history.installation, through }, events };
}

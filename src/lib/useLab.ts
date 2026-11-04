import { useCallback, useEffect, useRef, useState } from "react";
import {
  getJSON,
  parseHistory,
  parseStatus,
  POLL_MS,
  type History,
  type WheelStatus,
} from "./api";
import {
  newRoundMemory,
  newWheelMemory,
  observeRounds,
  observeWheel,
  type AlertEvent,
} from "./alerts";
import type { Settings } from "./settings";
import { DeliveryError, sendTelegram } from "./telegram";
export interface LogEntry extends AlertEvent {
  id: number;
  delivery: "sending" | "sent" | "failed";
  error?: string;
  retryAt?: number;
}
const safeError = (error: unknown) =>
  error instanceof Error &&
  error.name !== "AbortError" &&
  error.name !== "TimeoutError"
    ? error.message
    : "The API request timed out. Retrying every 15 seconds.";
export function useLab(settings: Settings) {
  const [status, setStatus] = useState<WheelStatus | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [statusError, setStatusError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [polling, setPolling] = useState(false);
  const [active, setActive] = useState(false);
  const [watchNotice, setWatchNotice] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [now, setNow] = useState(Date.now());
  const [nextPoll, setNextPoll] = useState(Date.now() + POLL_MS);
  const [testPending, setTestPending] = useState(false);
  const [testNotice, setTestNotice] = useState("");
  const configRef = useRef(settings);
  configRef.current = settings;
  const activeRef = useRef(false);
  const wheelMemory = useRef(newWheelMemory());
  const roundMemory = useRef(newRoundMemory());
  const startingRef = useRef(false);
  const lastInstallation = useRef("");
  const releaseRef = useRef<(() => void) | null>(null);
  const pollRef = useRef<AbortController | null>(null);
  const sendingRef = useRef<AbortController | null>(null);
  const idRef = useRef(0),
    epochRef = useRef(0),
    retryAtRef = useRef(0);
  const chainRef = useRef(Promise.resolve());
  const mounted = useRef(true);
  const updateLog = (id: number, patch: Partial<LogEntry>) => {
    if (mounted.current)
      setLogs((previous) =>
        previous.map((entry) =>
          entry.id === id ? { ...entry, ...patch } : entry,
        ),
      );
  };
  const deliver = useCallback(
    (event: AlertEvent, target: Settings, existingId?: number) => {
      const id = existingId ?? ++idRef.current,
        epoch = epochRef.current;
      if (existingId !== undefined)
        updateLog(id, { delivery: "sending", error: undefined });
      else
        setLogs((previous) =>
          [{ ...event, id, delivery: "sending" as const }, ...previous].slice(
            0,
            100,
          ),
        );
      const task = chainRef.current.then(async () => {
        if (epoch !== epochRef.current || !mounted.current) {
          updateLog(id, {
            delivery: "failed",
            error: "Sending was cancelled. You can retry this alert.",
          });
          return false;
        }
        if (retryAtRef.current > Date.now()) {
          updateLog(id, {
            delivery: "failed",
            error:
              "Telegram is rate limiting messages. Retry after the cooldown.",
            retryAt: retryAtRef.current,
          });
          return false;
        }
        const controller = new AbortController();
        sendingRef.current = controller;
        try {
          await sendTelegram(
            target.token,
            target.chatId,
            event.message,
            controller.signal,
          );
          updateLog(id, {
            delivery: "sent",
            error: undefined,
            retryAt: undefined,
          });
          return true;
        } catch (error) {
          const failure =
            error instanceof DeliveryError
              ? error
              : new DeliveryError(
                  "Delivery unconfirmed. Check your connection and retry.",
                );
          if (failure.retryAt) retryAtRef.current = failure.retryAt;
          updateLog(id, {
            delivery: "failed",
            error: failure.message,
            retryAt: failure.retryAt,
          });
          return false;
        } finally {
          if (sendingRef.current === controller) sendingRef.current = null;
        }
      });
      chainRef.current = task.then(
        () => undefined,
        () => undefined,
      );
      return task;
    },
    [],
  );
  const poll = useCallback(async () => {
    if (pollRef.current) return;
    const controller = new AbortController();
    pollRef.current = controller;
    setPolling(true);
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(10_000),
    ]);
    const statusTask = (async () => {
      try {
        const current = parseStatus(await getJSON("status", signal));
        if (!mounted.current || controller.signal.aborted) return;
        setStatus(current);
        setStatusError("");
        lastInstallation.current = current.installation;
        if (activeRef.current) {
          const result = observeWheel(
            wheelMemory.current,
            current,
            configRef.current.rules,
            Date.now(),
          );
          wheelMemory.current = result.memory;
          result.events.forEach(
            (event) => void deliver(event, configRef.current),
          );
        }
      } catch (error) {
        if (!mounted.current || controller.signal.aborted) return;
        setStatusError(safeError(error));
        wheelMemory.current = newWheelMemory();
      }
    })();
    const historyTask = (async () => {
      try {
        const current = parseHistory(
          await getJSON("settlements?range=24h", signal),
        );
        if (!mounted.current || controller.signal.aborted) return;
        await statusTask;
        if (!mounted.current || controller.signal.aborted) return;
        if (
          lastInstallation.current &&
          current.installation !== lastInstallation.current
        )
          throw new Error(
            "The status and history feeds disagree. Round alerts are paused until they match.",
          );
        setHistory(current);
        setHistoryError("");
        if (activeRef.current) {
          const result = observeRounds(
            roundMemory.current,
            current,
            configRef.current.rules.round,
            Date.now(),
          );
          roundMemory.current = result.memory;
          result.events.forEach(
            (event) => void deliver(event, configRef.current),
          );
        }
      } catch (error) {
        if (mounted.current && !controller.signal.aborted)
          setHistoryError(safeError(error));
      }
    })();
    await Promise.allSettled([statusTask, historyTask]);
    if (pollRef.current === controller) pollRef.current = null;
    if (mounted.current && !controller.signal.aborted) setPolling(false);
  }, [deliver]);
  const stop = useCallback(() => {
    activeRef.current = false;
    setActive(false);
    setTestNotice("");
    epochRef.current++;
    sendingRef.current?.abort();
    releaseRef.current?.();
    releaseRef.current = null;
    wheelMemory.current = newWheelMemory();
    roundMemory.current = newRoundMemory();
    setWatchNotice("Watching stopped. Live status will keep updating.");
  }, []);
  const start = useCallback(async () => {
    const activate = () => {
      wheelMemory.current = newWheelMemory();
      roundMemory.current = newRoundMemory();
      activeRef.current = true;
      setActive(true);
      setTestNotice("");
      setWatchNotice(
        "Watching started. The first poll sets a baseline; only new events send alerts.",
      );
      void poll();
    };
    if (activeRef.current || startingRef.current) return;
    startingRef.current = true;
    if (navigator.locks) {
      await new Promise<void>((resolve) => {
        void navigator.locks
          .request(
            "squeek-alert-lab:watch:v1",
            { ifAvailable: true },
            async (lock) => {
              if (!lock) {
                setWatchNotice(
                  "Another tab is already watching. Stop it there before starting here.",
                );
                resolve();
                return;
              }
              activate();
              resolve();
              await new Promise<void>((release) => {
                releaseRef.current = release;
              });
            },
          )
          .catch(() => {
            setWatchNotice(
              "This browser could not start a watching session. Reload the page and try again.",
            );
            resolve();
          });
      });
    } else activate();
    startingRef.current = false;
  }, [poll]);
  const test = useCallback(
    async (target: Settings) => {
      setTestPending(true);
      setTestNotice("");
      const at = Date.now();
      const sent = await deliver(
        {
          kind: "test",
          title: "Test alert",
          at,
          message: `Squeek Alert Lab\nYour bot is ready to squeek.\nThis is a test alert, not a live hamster event.\nSent ${new Date(at).toISOString()}`,
        },
        target,
      );
      if (mounted.current) {
        setTestPending(false);
        setTestNotice(
          sent
            ? "Test alert sent. Check your Telegram chat."
            : "Test alert failed. See the alert log below for the cause and retry.",
        );
      }
    },
    [deliver],
  );
  useEffect(() => {
    mounted.current = true;
    void poll();
    const pollStartedAt = Date.now();
    setNow(pollStartedAt);
    setNextPoll(pollStartedAt + POLL_MS);
    const interval = setInterval(() => {
      const polledAt = Date.now();
      setNow(polledAt);
      setNextPoll(polledAt + POLL_MS);
      void poll();
    }, POLL_MS);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const visible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      mounted.current = false;
      activeRef.current = false;
      epochRef.current++;
      clearInterval(interval);
      clearInterval(clock);
      document.removeEventListener("visibilitychange", visible);
      pollRef.current?.abort();
      sendingRef.current?.abort();
      releaseRef.current?.();
    };
  }, [poll]);
  return {
    status,
    history,
    statusError,
    historyError,
    polling,
    active,
    watchNotice,
    logs,
    now,
    nextPoll,
    start,
    stop,
    refresh: poll,
    test,
    testPending,
    testNotice,
    clearLog: () =>
      setLogs((previous) =>
        previous.filter((entry) => entry.delivery === "sending"),
      ),
    retry: (entry: LogEntry) => deliver(entry, configRef.current, entry.id),
  };
}

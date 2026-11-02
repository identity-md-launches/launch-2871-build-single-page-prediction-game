import { useCallback, useEffect, useRef, useState } from "react";
import { fetchFeed, type Feed } from "./api";
import {
  emptyLeague,
  ensurePlayer,
  parseLeague,
  STORAGE_KEY,
  type League,
} from "./game";

export function useClock() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}
export function useFeed() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const active = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setLoading(true);
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const next = await fetchFeed(controller.signal);
      setFeed((previous) =>
        !next.statusAvailable && previous?.installation === next.installation
          ? {
              ...next,
              coreStatus: previous.coreStatus,
              observedAt: previous.observedAt,
              rpm: previous.rpm,
              speed: previous.speed,
              cumulativeWork: previous.cumulativeWork,
              openWork: previous.openWork,
              settledThrough: previous.settledThrough,
            }
          : next,
      );
      setError(
        next.statusAvailable
          ? ""
          : "Wheel status is unavailable. New predictions are paused. Confirmed round results are still checked.",
      );
    } catch {
      if (!controller.signal.aborted || active.current)
        setError(
          "The live feed is unavailable. New predictions are paused. Pending stakes auto-refund if round data stays missing.",
        );
    } finally {
      clearTimeout(timeout);
      active.current = null;
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const t = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 15_000);
    const resume = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", resume);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", resume);
      active.current?.abort();
      active.current = null;
    };
  }, [refresh]);
  return { feed, error, loading, refresh };
}
export function useLeague() {
  const [issue, setIssue] = useState("");
  const [league, setLeague] = useState<League>(() => {
    try {
      const value = parseLeague(localStorage.getItem(STORAGE_KEY));
      ensurePlayer(value, "guest");
      return value;
    } catch {
      const value = emptyLeague();
      ensurePlayer(value, "guest");
      return value;
    }
  });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    try {
      parseLeague(localStorage.getItem(STORAGE_KEY));
    } catch {
      setIssue(
        "Saved league data cannot be read. Export or back up your browser data before clearing this site’s storage. Play is paused to protect it.",
      );
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      try {
        const value = parseLeague(e.newValue);
        ensurePlayer(value, "guest");
        setLeague(value);
      } catch {
        setIssue(
          "League data changed but could not be read. Reload to try again.",
        );
      }
    };
    addEventListener("storage", onStorage);
    return () => {
      mounted.current = false;
      removeEventListener("storage", onStorage);
    };
  }, []);
  const mutate = useCallback(async (change: (draft: League) => void) => {
    const commit = () => {
      const draft = parseLeague(localStorage.getItem(STORAGE_KEY));
      ensurePlayer(draft, "guest");
      const before = JSON.stringify(draft);
      change(draft);
      if (
        JSON.stringify(draft) !== before ||
        localStorage.getItem(STORAGE_KEY) === null
      )
        localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
      if (mounted.current) {
        setLeague(draft);
        setIssue("");
      }
    };
    try {
      if (navigator.locks) await navigator.locks.request(STORAGE_KEY, commit);
      else commit();
    } catch (e) {
      if (e instanceof DOMException || e instanceof SyntaxError) {
        const message =
          "Browser storage is unavailable or full. Allow site storage and reload before playing.";
        if (mounted.current) setIssue(message);
        throw new Error(message);
      }
      throw e;
    }
  }, []);
  return { league, mutate, storageIssue: issue };
}

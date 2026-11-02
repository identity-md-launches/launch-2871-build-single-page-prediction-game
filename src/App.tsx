import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  BANDS,
  isFeedFresh,
  REFUND_GRACE_MS,
  roundAt,
  type Band,
  type RoundResult,
} from "./lib/api";
import {
  acceptDuel,
  cancelDuel,
  claimRelief,
  createDuel,
  ensurePlayer,
  multiplierFor,
  placePrediction,
  settleLeague,
  utcDay,
  weeklyProfit,
  type League,
  type Prediction,
} from "./lib/game";
import { useClock, useFeed, useLeague } from "./lib/hooks";
import { shortAddress } from "./lib/wallet";
import { Hamster, Icon, WheelArt } from "./components/Art";
import { Wallet } from "./components/Wallet";
import { Modal } from "./components/Modal";

const number = (v: number | undefined, decimals = 0) =>
  v === undefined
    ? "–"
    : new Intl.NumberFormat("en-US", {
        maximumFractionDigits: decimals,
      }).format(v);
const time = (t: number) =>
  new Date(t).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
const countdown = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const label = (band: Band) => BANDS.find((b) => b.id === band)!.name;

function BandPicker({
  value,
  onChange,
  disabledBand,
}: {
  value: Band | null;
  onChange: (b: Band) => void;
  disabledBand?: Band;
}) {
  return (
    <fieldset className="band-fieldset">
      <legend>How hard will the hamster work?</legend>
      <div className="band-grid">
        {BANDS.map((b) => (
          <label
            key={b.id}
            className={`band-choice ${b.id} ${value === b.id ? "selected" : ""} ${disabledBand === b.id ? "unavailable" : ""}`}
          >
            <input
              type="radio"
              name="band"
              value={b.id}
              checked={value === b.id}
              onChange={() => onChange(b.id)}
              disabled={disabledBand === b.id}
            />
            <span className="selection-mark" aria-hidden="true">
              {value === b.id && <Icon name="check" size={12} />}
            </span>
            <Hamster mood={b.id} />
            <strong>{b.name}</strong>
            <span className="band-range">
              {b.range} <span>work</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function App() {
  const clientNow = useClock();
  const { feed, error: feedError, loading, refresh } = useFeed();
  const { league, mutate, storageIssue } = useLeague();
  const [playerId, setPlayerId] = useState("guest");
  const [mode, setMode] = useState<"solo" | "duel">("solo");
  const [band, setBand] = useState<Band | null>("run");
  const [stake, setStake] = useState("100");
  const [formError, setFormError] = useState("");
  const [duelError, setDuelError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);
  const [relief, setRelief] = useState(false);
  const [profile, setProfile] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [tab, setTab] = useState<"history" | "leaderboard">("history");
  const [filter, setFilter] = useState("all");
  const [historyLimit, setHistoryLimit] = useState(6);
  const [selectedPlayer, setSelectedPlayer] = useState("self");
  const stakeRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef(new Map<string, RoundResult>());
  const [settledResults, setSettledResults] = useState<RoundResult[]>([]);
  const now = clientNow + (feed?.serverOffset ?? 0);
  const round = feed?.anchor ? roundAt(feed.anchor, now) : null;
  const fresh = !feedError && isFeedFresh(feed, clientNow);
  const player = league.players[playerId] ?? {
    id: playerId,
    name: playerId === "guest" ? "Seedling" : `Hamster ${playerId.slice(2, 6)}`,
    balance: 1000,
    streak: 0,
    bestStreak: 0,
  };
  const ownPredictions = league.predictions.filter(
    (p) => p.player === playerId,
  );
  const nextPrediction = ownPredictions.find(
    (p) => p.round === round?.next && p.installation === feed?.installation,
  );
  const pendingCount = ownPredictions.filter(
    (p) => p.outcome === "pending",
  ).length;
  const wins = ownPredictions.filter((p) => p.outcome === "won").length;
  const losses = ownPredictions.filter((p) => p.outcome === "lost").length;
  const multiplier = multiplierFor(player.streak);
  const validStake =
    /^\d+$/.test(stake) && Number(stake) >= 10 && Number(stake) <= 500;
  const sleeping =
    feed?.coreStatus === "IDLE" || feed?.coreStatus === "SLEEPING";
  const wheelState = !feed
    ? "Connecting"
    : !fresh
      ? "Feed paused"
      : sleeping
        ? "Sleeping"
        : (feed.rpm ?? 0) > 0
          ? "Running"
          : feed.coreStatus === "UNKNOWN"
            ? "Unknown"
            : "Idle";
  const reliefEligible =
    player.balance < 300 && player.lastRelief !== utcDay(now);

  const settlementTick = Math.floor(now / 5000);
  useEffect(() => {
    // Give the initial history request (including its failure/timeout) a chance
    // to finish before making an irreversible missing-data refund on reload.
    if (!feed && loading) return;
    if (feed)
      for (const result of feed.results)
        resultsRef.current.set(`${feed.installation}:${result.round}`, result);
    const results = [...resultsRef.current.entries()]
      .filter(([key]) => key.startsWith(`${feed?.installation}:`))
      .map(([, r]) => r)
      .sort((a, b) => b.round - a.round)
      .slice(0, 144);
    setSettledResults(results);
    void mutate((draft) => {
      ensurePlayer(draft, playerId);
      // Cache and settle in the same effect so the first feed cannot refund
      // against the previous render's empty result list.
      settleLeague(draft, results, now, feed?.installation);
    }).catch((e) =>
      setNotice(
        e instanceof Error
          ? e.message
          : "League update failed. Reload to try again.",
      ),
    );
    // Settle on each feed update and every five seconds, including while the API is down.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settlementTick, feed, loading, playerId, mutate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    setNotice("");
    if (!band) {
      setFormError("Choose a work band.");
      return;
    }
    if (!/^\d+$/.test(stake) || Number(stake) < 10 || Number(stake) > 500) {
      setFormError("Enter a whole stake from 10 to 500 SP.");
      stakeRef.current?.focus();
      return;
    }
    if (!fresh || !round || !feed) {
      setFormError(
        "Waiting for a fresh live feed. Try refreshing the wheel panel.",
      );
      return;
    }
    if (storageIssue) {
      setFormError(storageIssue);
      return;
    }
    if (mode === "duel" && playerId === "guest") {
      setFormError("Connect and sign in with a wallet to create a duel.");
      return;
    }
    setBusy(true);
    try {
      await mutate((draft) => {
        const input = {
          player: playerId,
          round: round.next,
          installation: feed.installation,
          start: round.nextStart,
          end: round.nextEnd,
          band,
          stake: Number(stake),
          now: Date.now() + feed.serverOffset,
        };
        if (mode === "solo") placePrediction(draft, input);
        else createDuel(draft, input);
      });
      setNotice(
        mode === "solo"
          ? `${label(band)} prediction locked for round #${round.next}. Good luck, little forecaster.`
          : "Duel created. Pass this browser to your friend and let them sign in with a different wallet.",
      );
    } catch (e) {
      setFormError(
        e instanceof Error
          ? e.message
          : "Prediction could not be saved. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function action(
    fn: (draft: League) => void,
    success: string,
    onError?: (message: string) => void,
  ) {
    setBusy(true);
    setNotice("");
    try {
      await mutate(fn);
      setNotice(success);
      return true;
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : "This action could not be saved. Try again.";
      setNotice(message);
      onError?.(message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function navigate(nextTab: "history" | "leaderboard") {
    setTab(nextTab);
    if (nextTab === "history") {
      setSelectedPlayer("self");
      setFilter("all");
    }
    requestAnimationFrame(() =>
      document
        .getElementById("league")
        ?.scrollIntoView({ behavior: "instant", block: "start" }),
    );
  }
  function exportHistory() {
    const rows = [
      [
        "Round",
        "Mode",
        "Band",
        "Stake SP",
        "Result",
        "Payout SP",
        "Net SP",
        "Actual work",
        "Reason",
      ],
      ...ownPredictions
        .slice()
        .reverse()
        .map((p) => [
          p.round,
          p.duelId ? "Duel" : "Solo",
          label(p.band),
          p.stake,
          p.outcome,
          p.outcome === "pending" ? "" : p.payout,
          p.outcome === "pending" ? "" : p.payout - p.stake,
          p.work ?? "",
          p.reason ?? "",
        ]),
    ];
    const csv = rows
      .map((row) =>
        row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(","),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "squeek-streak-history.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const historyPlayer = selectedPlayer === "self" ? playerId : selectedPlayer;
  const history = league.predictions
    .filter(
      (p) =>
        p.player === historyPlayer &&
        (filter === "all" || p.outcome === filter),
    )
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt);
  const ranked = Object.values(league.players)
    .map((p) => ({ ...p, profit: weeklyProfit(league, p.id, now) }))
    .sort((a, b) => b.profit - a.profit || a.name.localeCompare(b.name));
  const openDuels = league.duels.filter(
    (d) => d.status === "open" && d.start > now,
  );
  const recent = settledResults.slice(0, 7);

  return (
    <>
      <a className="skip-link" href="#play">
        Skip to game
      </a>
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="#play" aria-label="Squeek Streak home">
            <span className="brand-mark">
              <Hamster />
            </span>
            <span>
              Squeek<span className="brand-light"> Streak</span>
            </span>
          </a>
          <nav aria-label="Main navigation">
            <a href="#play" className="nav-play">
              Play
            </a>
            <button onClick={() => navigate("history")}>My history</button>
            <button onClick={() => navigate("leaderboard")}>Leaderboard</button>
          </nav>
          <div className="header-utilities">
            <button
              className="icon-button help-button"
              aria-label="How to play"
              onClick={() => setHelp(true)}
            >
              <Icon name="help" />
            </button>
            <Wallet
              onLogin={setPlayerId}
              onLogout={() => setPlayerId("guest")}
            />
          </div>
        </div>
      </header>

      <main className="page-container">
        <section className="page-intro">
          <div>
            <h1>Little wheel. Big predictions.</h1>
            <p>Predict the next 10 minutes of Squeekchain.</p>
          </div>
          <button
            className="text-button intro-help"
            onClick={() => setHelp(true)}
          >
            How to play <Icon name="help" size={17} />
          </button>
        </section>

        <section className="account-strip" aria-label="Your game stats">
          <button
            className="account-name"
            onClick={() => {
              setProfileName(player.name);
              setProfile(true);
            }}
          >
            <span className="avatar">
              <Hamster />
            </span>
            <span>
              <strong>{player.name}</strong>
              <span className="account-mode">
                {playerId === "guest" ? "Guest practice" : "Wallet player"}{" "}
                <Icon name="chevron" size={12} />
              </span>
            </span>
          </button>
          <div className="balance-stat">
            <span className="stat-label">Balance</span>
            <strong>
              <Icon name="seed" size={17} />
              {number(player.balance)} <span>SP</span>
            </strong>
          </div>
          <div className="strip-stat">
            <span className="stat-label">Current streak</span>
            <strong>
              <Icon name="bolt" size={17} />
              {player.streak}{" "}
              <span>{player.streak === 1 ? "win" : "wins"}</span>
            </strong>
          </div>
          <div className="strip-stat best-streak">
            <span className="stat-label">Best streak</span>
            <strong>
              <Icon name="trophy" size={17} />
              {player.bestStreak}{" "}
              <span>{player.bestStreak === 1 ? "win" : "wins"}</span>
            </strong>
          </div>
          <button
            className={`relief-button ${reliefEligible ? "eligible" : ""}`}
            aria-label="Daily relief"
            onClick={() => setRelief(true)}
          >
            <Icon name="seed" size={17} />
            <span>Daily relief</span>
            <Icon name="chevron" size={14} />
          </button>
        </section>

        {storageIssue && (
          <div className="error-banner" role="alert">
            {storageIssue}
          </div>
        )}

        <div className="game-grid" id="play">
          <section className="live-panel" aria-labelledby="wheel-title">
            <div className="section-heading">
              <h2 id="wheel-title">The hamster, right now</h2>
              <span className={`live-label ${fresh ? "" : "paused"}`}>
                <span className="status-dot" />
                {fresh ? "Live" : loading ? "Connecting" : "Paused"}
              </span>
            </div>
            <WheelArt
              sleeping={sleeping}
              running={fresh && !sleeping && (feed?.rpm ?? 0) > 0}
            />
            <div className="wheel-caption">
              <span className={`state-badge ${sleeping ? "sleeping" : ""}`}>
                <span className="status-dot" />
                {wheelState}
              </span>
              <p>
                {!feed
                  ? "Listening for little footsteps…"
                  : !fresh
                    ? "Waiting for fresh wheel data."
                    : sleeping
                      ? "Even little legs need a break."
                      : "Every little step adds up."}
              </p>
            </div>
            <dl className="wheel-metrics">
              <div>
                <dt>Wheel RPM</dt>
                <dd>{number(feed?.rpm, 2)}</dd>
              </div>
              <div>
                <dt>
                  Speed <span>(mm/s)</span>
                </dt>
                <dd>{number(feed?.speed)}</dd>
              </div>
              <div>
                <dt>Round work</dt>
                <dd>{number(feed?.openWork)}</dd>
              </div>
            </dl>
            <div className="live-foot">
              <span>
                Round <strong>{round ? `#${round.current}` : "–"}</strong>
              </span>
              <span>
                <strong>{number(feed?.settledThrough)}</strong> rounds settled
              </span>
            </div>
            <p className="total-work">
              Total wheel work <strong>{number(feed?.cumulativeWork)}</strong>
            </p>
            <div className="feed-source">
              <a
                href="https://api.squeekchain.com/v1/status"
                target="_blank"
                rel="noreferrer"
              >
                Official Squeekchain feed <Icon name="external" size={12} />
              </a>
              <button
                aria-label="Refresh live feed"
                className="icon-button refresh-button"
                disabled={loading}
                onClick={() => void refresh()}
              >
                <Icon name="refresh" size={14} />
              </button>
            </div>
            {(feedError || (feed && !feed.historyAvailable)) && (
              <div className="feed-error" role="status">
                {feedError ||
                  "Settlement history is unavailable. Predictions pause until round timing returns."}
                <button
                  className="text-button"
                  disabled={loading}
                  onClick={() => void refresh()}
                >
                  Retry feed
                </button>
              </div>
            )}
          </section>

          <section className="play-panel" aria-labelledby="prediction-title">
            <div className="mode-tabs" aria-label="Game mode">
              <button
                className={mode === "solo" ? "active" : ""}
                aria-pressed={mode === "solo"}
                onClick={() => {
                  setMode("solo");
                  setFormError("");
                }}
              >
                <Icon name="bolt" size={17} />
                Streak prediction
              </button>
              <button
                className={mode === "duel" ? "active" : ""}
                aria-pressed={mode === "duel"}
                onClick={() => {
                  setMode("duel");
                  setFormError("");
                }}
              >
                <Icon name="duel" size={17} />
                1v1 duel
                {openDuels.length > 0 && (
                  <span className="duel-count">{openDuels.length}</span>
                )}
              </button>
            </div>
            <div className="prediction-heading">
              <div>
                <h2 id="prediction-title">
                  {mode === "solo"
                    ? "What’s your next move?"
                    : "Two players. One little wheel."}
                </h2>
                <p>
                  {round
                    ? `Predict round #${round.next} · ${time(round.nextStart)}–${time(round.nextEnd)} UTC`
                    : "Next round · waiting for official timing"}
                </p>
              </div>
              <div className="round-timer">
                <span>Locks in</span>
                <strong>
                  {round ? countdown(round.nextStart - now) : "--:--"}
                </strong>
              </div>
            </div>
            <form onSubmit={(e) => void submit(e)} noValidate>
              <BandPicker
                value={band}
                onChange={(b) => {
                  setBand(b);
                  setFormError("");
                  setDuelError("");
                }}
              />
              <div className="stake-heading">
                <label htmlFor="stake">Your stake</label>
                <span>10–500 SP</span>
              </div>
              <div className="stake-controls">
                <div className="stake-input-wrap">
                  <Icon name="seed" size={18} />
                  <input
                    ref={stakeRef}
                    id="stake"
                    name="stake"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={stake}
                    onChange={(e) => {
                      setStake(e.target.value);
                      setFormError("");
                    }}
                    aria-invalid={
                      !!formError &&
                      (!validStake || Number(stake) > player.balance)
                    }
                    aria-describedby="prediction-error stake-hint"
                  />
                  <span>SP</span>
                </div>
                <div className="stake-presets">
                  {[50, 100, 250].map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={stake === String(n)}
                      className={stake === String(n) ? "selected" : ""}
                      onClick={() => {
                        setStake(String(n));
                        setFormError("");
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div className="payout-line" id="stake-hint">
                <span>
                  {mode === "solo" ? (
                    <>
                      If correct{" "}
                      <strong className="multiplier-tag">
                        {multiplier.toFixed(2).replace(/0$/, "")}×
                      </strong>
                    </>
                  ) : (
                    "Winner takes the pot"
                  )}
                </span>
                <strong>
                  {number(
                    validStake
                      ? Math.floor(
                          Number(stake) * (mode === "solo" ? multiplier : 2),
                        )
                      : 0,
                  )}{" "}
                  SP <span>return</span>
                </strong>
              </div>
              <button
                className="button primary predict-button"
                type="submit"
                disabled={busy || !!nextPrediction || !fresh || !!storageIssue}
              >
                {nextPrediction ? (
                  <>
                    <Icon name="check" size={19} />
                    {nextPrediction.duelId
                      ? "Duel stake locked"
                      : `${label(nextPrediction.band)} prediction locked`}
                  </>
                ) : busy ? (
                  "Saving prediction…"
                ) : mode === "solo" ? (
                  <>
                    Lock prediction
                    <Icon name="arrow" size={18} />
                  </>
                ) : (
                  <>
                    Create a duel
                    <Icon name="duel" size={18} />
                  </>
                )}
              </button>
              <div id="prediction-error" className="form-error" role="status">
                {formError}
              </div>
              <p className="play-footnote">
                {nextPrediction
                  ? `${nextPrediction.stake} SP staked for round #${nextPrediction.round}. Results arrive after the round settles.`
                  : !fresh
                    ? loading
                      ? "Connecting to Squeekchain. Picks open when the feed is ready."
                      : "Picks paused. Refresh the live feed to try again."
                    : mode === "solo"
                      ? "Free points. Real hamster work. No gas."
                      : "Two wallets in this browser. Same round, different bands."}
              </p>
            </form>
            {mode === "duel" && (
              <div className="duel-lobby">
                <div className="duel-lobby-heading">
                  <h3>Open duels</h3>
                  <span>This browser only</span>
                </div>
                <p className="muted duel-instructions">
                  Pass this device to a friend. They sign in with another
                  wallet, choose a different band, and match your stake.
                </p>
                <p className="form-error" role="status">
                  {duelError}
                </p>
                {openDuels.length === 0 ? (
                  <p className="empty-duels">
                    No open duels yet. Create the first challenge above.
                  </p>
                ) : (
                  openDuels.map((d) => (
                    <div className="duel-row" key={d.id}>
                      <div>
                        <strong>
                          {league.players[d.host]?.name} picked {label(d.band)}
                        </strong>
                        <span>
                          #{d.round} · {d.stake} SP each · {d.stake * 2} SP pot
                        </span>
                      </div>
                      {d.host === playerId ? (
                        <button
                          className="small-button"
                          disabled={busy}
                          onClick={() =>
                            void action(
                              (draft) => cancelDuel(draft, d.id, playerId, now),
                              "Duel cancelled. Your stake was returned.",
                            )
                          }
                        >
                          Cancel duel
                        </button>
                      ) : (
                        <button
                          className="small-button"
                          disabled={busy || !fresh}
                          onClick={() => {
                            if (!band || band === d.band) {
                              setDuelError(
                                "Choose a different band from your opponent above.",
                              );
                              return;
                            }
                            setDuelError("");
                            void action(
                              (draft) =>
                                acceptDuel(
                                  draft,
                                  d.id,
                                  playerId,
                                  band,
                                  Date.now() + (feed?.serverOffset ?? 0),
                                ),
                              `Duel accepted. Your ${label(band)} pick is locked for round #${d.round}.`,
                              setDuelError,
                            );
                          }}
                        >
                          Join with {band ? label(band) : "a pick"}
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </section>
        </div>

        <div className="notice" role="status">
          {notice && (
            <>
              <Icon name="seed" size={18} />
              <span>{notice}</span>
              <button
                className="icon-button"
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                <Icon name="close" size={16} />
              </button>
            </>
          )}
        </div>

        <div className="insights-grid">
          <section className="recent-section" aria-labelledby="recent-title">
            <div className="section-heading">
              <h2 id="recent-title">Recent rounds</h2>
              <span className="muted">Confirmed work</span>
            </div>
            {recent.length ? (
              <>
                <div className="recent-rounds">
                  {recent.map((r) => (
                    <div className={`recent-round ${r.band}`} key={r.round}>
                      <span className="recent-round-id">#{r.round}</span>
                      <span className={`round-band ${r.band}`}>
                        {label(r.band)}
                      </span>
                      <strong>{number(r.work)}</strong>
                    </div>
                  ))}
                </div>
                <div className="recent-caption">
                  <span>Work units per settled round</span>
                  <a
                    href="https://api.squeekchain.com/v1/settlements?range=24h"
                    target="_blank"
                    rel="noreferrer"
                  >
                    View source <Icon name="external" size={12} />
                  </a>
                </div>
              </>
            ) : (
              <div className="empty-rounds">
                <Icon name="history" size={24} />
                <p>
                  {loading
                    ? "Loading official settlements…"
                    : "No confirmed per-round data is available. New results appear here when the API confirms them."}
                </p>
              </div>
            )}
          </section>
          <section className="streak-section" aria-labelledby="streak-title">
            <div className="section-heading">
              <h2 id="streak-title">
                <Icon name="bolt" size={19} />
                Keep the streak squeeking
              </h2>
              <span className="muted">Up to 3×</span>
            </div>
            <p>Keep picking correctly. Your next win gets a bigger return.</p>
            <ol className="streak-steps">
              {[2, 2.25, 2.5, 2.75, 3].map((m, i) => (
                <li
                  className={
                    Math.min(player.streak, 4) === i
                      ? "current"
                      : player.streak > i
                        ? "complete"
                        : ""
                  }
                  key={m}
                >
                  <span>
                    {i === 4 ? (
                      <Icon name="trophy" size={18} />
                    ) : (
                      <Icon name="seed" size={17} />
                    )}
                  </span>
                  <strong>{m}×</strong>
                  <small>{i === 4 ? "5+ wins" : `Win ${i + 1}`}</small>
                </li>
              ))}
            </ol>
            <span className="streak-note">
              A miss resets your streak. A refund keeps it safe.
            </span>
          </section>
        </div>

        <section
          className="league-section"
          id="league"
          aria-label="Player activity"
        >
          <div className="league-heading">
            <div className="activity-tabs" aria-label="Activity view">
              <button
                className={tab === "history" ? "active" : ""}
                aria-pressed={tab === "history"}
                onClick={() => setTab("history")}
              >
                <Icon name="history" size={19} />
                Prediction history
                {pendingCount > 0 && (
                  <span className="pending-count">{pendingCount}</span>
                )}
              </button>
              <button
                className={tab === "leaderboard" ? "active" : ""}
                aria-pressed={tab === "leaderboard"}
                onClick={() => setTab("leaderboard")}
              >
                <Icon name="trophy" size={19} />
                Weekly leaderboard
              </button>
            </div>
            <span className="local-league">
              <span className="status-dot" />
              Local league
            </span>
          </div>
          <div className="league-context">
            <p>
              {tab === "history"
                ? "Every pick, every little victory."
                : "Ranked by settled net profit since Monday, 00:00 UTC."}
            </p>
            <span>Saved in this browser. No shared global scores.</span>
          </div>
          {tab === "history" ? (
            <>
              <div className="history-toolbar">
                <div className="history-filters">
                  <label className="select-label">
                    Player
                    <select
                      aria-label="History player"
                      value={selectedPlayer}
                      onChange={(e) => {
                        setSelectedPlayer(e.target.value);
                        setHistoryLimit(6);
                      }}
                    >
                      <option value="self">{player.name} (you)</option>
                      {Object.values(league.players)
                        .filter((p) => p.id !== playerId)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                            {p.id !== "guest"
                              ? ` · ${shortAddress(p.id)}`
                              : " · guest"}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="select-label">
                    Result
                    <select
                      aria-label="Filter history by result"
                      value={filter}
                      onChange={(e) => {
                        setFilter(e.target.value);
                        setHistoryLimit(6);
                      }}
                    >
                      <option value="all">All results</option>
                      <option value="pending">Pending</option>
                      <option value="won">Won</option>
                      <option value="lost">Lost</option>
                      <option value="refunded">Refunded</option>
                    </select>
                  </label>
                </div>
                <button
                  className="text-button export-button"
                  onClick={exportHistory}
                >
                  <Icon name="download" size={16} />
                  Export my CSV
                </button>
              </div>
              {history.length ? (
                <>
                  <div
                    className="history-table"
                    role="table"
                    aria-label="Prediction history"
                  >
                    <div className="history-table-head" role="row">
                      <span role="columnheader">Round / pick</span>
                      <span role="columnheader">Stake</span>
                      <span role="columnheader">Result</span>
                      <span role="columnheader">Net return</span>
                    </div>
                    {history.slice(0, historyLimit).map((p) => (
                      <HistoryRow key={p.id} p={p} now={now} />
                    ))}
                  </div>
                  {history.length > historyLimit && (
                    <button
                      className="button secondary load-more"
                      onClick={() => setHistoryLimit((n) => n + 12)}
                    >
                      Show more predictions
                    </button>
                  )}
                </>
              ) : (
                <div className="history-empty">
                  <span className="empty-icon">
                    <Icon name="seed" size={25} />
                  </span>
                  <div>
                    <h3>
                      {filter !== "all"
                        ? `No ${filter} predictions yet`
                        : "Your first streak starts with one pick."}
                    </h3>
                    <p>
                      {filter !== "all"
                        ? "Choose all results to see your other picks."
                        : "Choose a band above and put your hamster instinct to the test."}
                    </p>
                  </div>
                  <button
                    className="small-button"
                    onClick={() => {
                      if (filter !== "all") setFilter("all");
                      else
                        document
                          .getElementById("prediction-title")
                          ?.scrollIntoView({
                            behavior: "instant",
                            block: "start",
                          });
                    }}
                  >
                    {filter !== "all"
                      ? "Show all results"
                      : "Make a prediction"}
                    <Icon name="arrow" size={16} />
                  </button>
                </div>
              )}
            </>
          ) : (
            <div
              className="leaderboard-table"
              role="table"
              aria-label="Local weekly leaderboard"
            >
              <div className="leaderboard-head" role="row">
                <span role="columnheader">Rank</span>
                <span role="columnheader">Player</span>
                <span role="columnheader">Best streak</span>
                <span role="columnheader">Weekly profit</span>
              </div>
              {ranked.map((p, i) => (
                <div
                  className={`leaderboard-row ${p.id === playerId ? "you" : ""}`}
                  role="row"
                  key={p.id}
                >
                  <span role="cell" className="rank">
                    {i + 1}
                  </span>
                  <span role="cell" className="leaderboard-player">
                    <span className="avatar small">
                      <Hamster />
                    </span>
                    <button
                      className="player-history-button"
                      onClick={() => {
                        setSelectedPlayer(p.id === playerId ? "self" : p.id);
                        setFilter("all");
                        setTab("history");
                      }}
                    >
                      {p.name}
                      {p.id === playerId && (
                        <span className="you-label">You</span>
                      )}
                      <small>
                        {p.id === "guest"
                          ? "Guest practice"
                          : shortAddress(p.id)}
                      </small>
                    </button>
                  </span>
                  <span role="cell">{p.bestStreak} wins</span>
                  <strong
                    role="cell"
                    className={
                      p.profit > 0 ? "positive" : p.profit < 0 ? "negative" : ""
                    }
                  >
                    {p.profit > 0 ? "+" : ""}
                    {number(p.profit)} SP
                  </strong>
                </div>
              ))}
              <p className="leaderboard-note">
                Relief and your starting 1,000 SP never count as profit. Select
                a player to view their history.
              </p>
            </div>
          )}
        </section>
        <div className="bottom-note">
          <Icon name="shield" size={17} />
          <p>
            Missing round data? Stakes return automatically after a 20-minute
            grace period. SP is free play money with no cash value.
          </p>
          <button className="text-button" onClick={() => setHelp(true)}>
            Read the rules <Icon name="chevron" size={14} />
          </button>
        </div>
      </main>
      <footer className="site-footer">
        <div>
          <span className="footer-brand">
            <Icon name="seed" size={17} />
            Squeek Streak
          </span>
          <span>Small paws. Big possibilities.</span>
        </div>
        <div>
          <a href="https://squeekchain.com" target="_blank" rel="noreferrer">
            Powered by Squeekchain <Icon name="external" size={13} />
          </a>
          <span>Play points only · No gas</span>
        </div>
      </footer>

      {help && (
        <Modal
          title="A little wheel. Four ways to play."
          onClose={() => setHelp(false)}
          className="rules-modal"
        >
          <div className="rules-content">
            <p>
              Predict the <strong>next</strong> 10-minute round’s total wheel
              work. Current-round work is a clue, never the result.
            </p>
            <ol className="rules-steps">
              <li>
                <strong>Pick a band.</strong> Sleep: 0. Stroll: 1–99. Run:
                100–499. Sprint: 500+ work units.
              </li>
              <li>
                <strong>Stake 10–500 SP.</strong> You start with 1,000 free SP.
                One pick per player per round; picks lock when submitted.
              </li>
              <li>
                <strong>Wait for confirmed work.</strong> Results come from the
                official Squeekchain settlement API, never from RPM estimates.
              </li>
            </ol>
            <h3>Streak rewards</h3>
            <p>
              Win 1 returns 2× your stake; consecutive wins return 2.25×, 2.5×,
              2.75×, then 3× from win 5 onward. Returns include your stake and
              round down to whole SP. A loss resets the solo streak. The
              multiplier is determined when earlier picks finish settling.
            </p>
            <h3>1v1 duels</h3>
            <p>
              Two different signed-in wallets in this browser stake the same SP
              on different bands in the same round. The only correct player
              takes the 2× pot. If neither is correct, both are refunded. Duels
              do not change solo streaks. Unmatched duels refund when the round
              starts; the host can cancel before a match.
            </p>
            <h3>Missing data & daily relief</h3>
            <p>
              Missing, unsafe, or ambiguous round work is never treated as zero.
              If no exact confirmed result is available within{" "}
              {REFUND_GRACE_MS / 60_000} minutes after a round ends, stakes
              refund and streaks stay safe. Checks run while the page is open
              and catch up when reopened.
            </p>
            <p>
              Below 300 SP? Claim 300 SP once per UTC day. Daily relief resets
              at 00:00 UTC.
            </p>
            <h3>Your local league</h3>
            <p>
              Points, duels, history, and rankings live in this browser’s
              storage. Wallet signatures verify your local identity for 24
              hours; they do not sync scores across devices. Guest practice has
              its own balance. No server enforces balances, and clearing storage
              resets the league.
            </p>
            <p>
              Weekly profit counts settled returns minus stakes from Monday at
              00:00 UTC, including duels. Starting points, pending stakes, and
              relief are excluded.
            </p>
          </div>
          <button
            className="button primary full-width"
            onClick={() => setHelp(false)}
          >
            Got it. Let’s predict.
            <Icon name="arrow" size={18} />
          </button>
        </Modal>
      )}
      {relief && (
        <Modal
          title="A few seeds to keep going"
          onClose={() => setRelief(false)}
        >
          <div className="relief-illustration">
            <Hamster mood="stroll" />
          </div>
          <p>
            Claim <strong>300 SP</strong> when your balance falls below 300 SP.
            Available once per UTC day, resetting at 00:00 UTC.
          </p>
          <div className="relief-summary">
            <span>Your balance</span>
            <strong>{number(player.balance)} SP</strong>
          </div>
          <p className="muted">
            {reliefEligible
              ? "Your relief is ready. A fresh start for those little paws."
              : player.lastRelief === utcDay(now)
                ? "Today’s relief is claimed. Come back after 00:00 UTC."
                : "You have enough seeds for now. Relief unlocks below 300 SP."}
          </p>
          <button
            className="button primary full-width"
            disabled={!reliefEligible || busy}
            onClick={() =>
              void action(
                (draft) => claimRelief(draft, playerId, now),
                "300 SP relief claimed. Your next streak awaits.",
              ).then((success) => {
                if (success) setRelief(false);
              })
            }
          >
            Claim 300 SP
            <Icon name="seed" size={18} />
          </button>
        </Modal>
      )}
      {profile && (
        <Modal title="Make yourself at home" onClose={() => setProfile(false)}>
          <p className="muted">
            Give your local player a name.{" "}
            {playerId === "guest"
              ? "Connect a wallet to create or accept duels."
              : `Signed in as ${shortAddress(playerId)}.`}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const name = profileName.trim();
              if (!name || name.length > 24) return;
              void action((draft) => {
                ensurePlayer(draft, playerId).name = name;
              }, "Player name saved.").then((success) => {
                if (success) setProfile(false);
              });
            }}
          >
            <label className="profile-label" htmlFor="player-name">
              Player name
            </label>
            <input
              id="player-name"
              className="text-input"
              name="nickname"
              autoComplete="nickname"
              value={profileName}
              required
              maxLength={24}
              onChange={(e) => setProfileName(e.target.value)}
            />
            <p className="muted">
              1–24 characters. Saved only in this browser.
            </p>
            <div className="profile-stats">
              <span>{wins} wins</span>
              <span>{losses} losses</span>
              <span>{pendingCount} pending</span>
            </div>
            <button
              className="button primary full-width"
              type="submit"
              disabled={busy}
            >
              Save player name
              <Icon name="check" size={18} />
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

function HistoryRow({ p, now }: { p: Prediction; now: number }) {
  const status =
    p.outcome === "pending"
      ? now < p.start
        ? "Locked"
        : now < p.end
          ? "In progress"
          : "Settling"
      : p.outcome === "won"
        ? "Won"
        : p.outcome === "lost"
          ? "Lost"
          : "Refunded";
  return (
    <div className="history-row" role="row">
      <div role="cell" className="history-pick">
        <span className={`history-band-icon ${p.band}`}>
          <Hamster mood={p.band} />
        </span>
        <div>
          <strong>
            #{p.round} · {label(p.band)}
          </strong>
          <span>
            {p.duelId ? "1v1 duel" : "Solo"} · {p.stake} SP
            {p.work !== undefined ? ` · ${p.work} work` : ""}
          </span>
          {p.reason && <small>{p.reason}</small>}
        </div>
      </div>
      <span role="cell" className="history-stake">
        {p.stake} SP
      </span>
      <span role="cell">
        <span className={`result-badge ${p.outcome}`}>{status}</span>
      </span>
      <strong
        role="cell"
        className={
          p.outcome === "won"
            ? "positive"
            : p.outcome === "lost"
              ? "negative"
              : "muted"
        }
      >
        {p.outcome === "pending"
          ? "Pending"
          : `${p.payout - p.stake > 0 ? "+" : ""}${p.payout - p.stake} SP`}
      </strong>
    </div>
  );
}

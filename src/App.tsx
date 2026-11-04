import { useEffect, useRef, useState, type FormEvent } from "react";
import { Hamster, Icon, WheelArt } from "./components/Art";
import { type Trigger } from "./lib/alerts";
import {
  credentialsError,
  initialSettings,
  readSettings,
  STORAGE_KEY,
  validTarget,
  validToken,
} from "./lib/settings";
import { findTelegramChats, type TelegramChat } from "./lib/telegram";
import { useLab } from "./lib/useLab";
const format = (value: number | undefined, decimals = 0) =>
  value === undefined
    ? "—"
    : new Intl.NumberFormat("en-US", {
        maximumFractionDigits: decimals,
      }).format(value);
const localTime = (at: number) =>
  new Date(at).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
const TRIGGERS: {
  id: Trigger;
  title: string;
  description: string;
  icon: string;
}[] = [
  {
    id: "wake",
    title: "Hamster wake-up",
    description: "The wheel goes from 0 RPM to moving.",
    icon: "sun",
  },
  {
    id: "sleep",
    title: "Hamster sleep",
    description: "Back to 0 RPM for at least 5 minutes.",
    icon: "moon",
  },
  {
    id: "round",
    title: "New round settled",
    description: "A new round is confirmed by Squeekchain.",
    icon: "flag",
  },
  {
    id: "threshold",
    title: "RPM threshold crossing",
    description: "Crosses your target, upward or downward.",
    icon: "gauge",
  },
];
export default function App() {
  const [loaded] = useState(readSettings);
  const [settings, setSettings] = useState(loaded.settings);
  const [storageError, setStorageError] = useState(loaded.error);
  const [target, setTarget] = useState(String(loaded.settings.rules.rpmTarget));
  const [showToken, setShowToken] = useState(false);
  const [formError, setFormError] = useState<{
    field: string;
    message: string;
  } | null>(null);
  const [forgetting, setForgetting] = useState(false);
  const [findBusy, setFindBusy] = useState(false);
  const [findNotice, setFindNotice] = useState("");
  const [chats, setChats] = useState<TelegramChat[]>([]);
  const [logFilter, setLogFilter] = useState("all");
  const findEpoch = useRef(0);
  const tokenRef = useRef<HTMLInputElement>(null),
    chatRef = useRef<HTMLInputElement>(null),
    targetRef = useRef<HTMLInputElement>(null);
  const lab = useLab(settings);
  const chosen = TRIGGERS.filter(
    (trigger) => settings.rules[trigger.id],
  ).length;
  const statusFresh =
    !!lab.status &&
    !lab.statusError &&
    lab.now - lab.status.receivedAt < 45_000 &&
    lab.now - lab.status.observedAt <= lab.status.staleAfter;
  const running = statusFresh && lab.status!.rpm > 0;
  const historyFresh =
    !!lab.history &&
    !lab.historyError &&
    lab.now - lab.history.generatedAt < 120_000;
  const settledThrough = historyFresh
    ? lab.history!.settlements.at(-1)?.through
    : undefined;
  const logItems = lab.logs.filter(
    (entry) => logFilter === "all" || entry.delivery === logFilter,
  );
  const sentCount = lab.logs.filter(
    (entry) => entry.delivery === "sent",
  ).length;
  useEffect(() => {
    try {
      if (!settings.token && !settings.chatId)
        localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      setStorageError("");
    } catch {
      setStorageError(
        "Browser storage is unavailable. Settings stay in memory for this visit.",
      );
    }
  }, [settings]);
  function validate(includeRules: boolean) {
    const error = credentialsError(settings);
    if (error) {
      setFormError(error);
      (error.field === "token" ? tokenRef : chatRef).current?.focus();
      return false;
    }
    if (includeRules && chosen === 0) {
      setFormError({
        field: "rules",
        message: "Choose at least one alert below, then start watching.",
      });
      document.getElementById("trigger-wake")?.focus();
      return false;
    }
    if (includeRules && settings.rules.threshold && !validTarget(target)) {
      setFormError({
        field: "target",
        message: "Set an RPM target greater than 0 and no more than 1,000,000.",
      });
      targetRef.current?.focus();
      return false;
    }
    setFormError(null);
    return true;
  }
  function watch(event: FormEvent) {
    event.preventDefault();
    if (lab.active) lab.stop();
    else if (validate(true)) void lab.start();
  }
  function forget() {
    findEpoch.current++;
    setFindBusy(false);
    lab.stop();
    setSettings(initialSettings());
    setTarget("500");
    setShowToken(false);
    setForgetting(false);
    setFormError(null);
    setChats([]);
    setFindNotice("");
    tokenRef.current?.focus();
  }
  async function findChat() {
    if (!validToken(settings.token)) {
      setFormError({
        field: "token",
        message:
          "Paste the full bot token from @BotFather, including the colon.",
      });
      tokenRef.current?.focus();
      return;
    }
    const epoch = ++findEpoch.current;
    setFindBusy(true);
    setFindNotice("");
    setChats([]);
    try {
      const found = await findTelegramChats(settings.token);
      if (epoch !== findEpoch.current) return;
      if (found.length === 1) {
        setSettings((previous) => ({ ...previous, chatId: found[0].id }));
        setFindNotice(`Chat ID found for ${found[0].label}.`);
      } else if (found.length > 1) {
        setChats(found);
        setFindNotice("Choose the chat that should receive alerts.");
      } else
        setFindNotice(
          "No recent chats found. Send /start to your bot in Telegram, then try again.",
        );
    } catch (error) {
      if (epoch !== findEpoch.current) return;
      setFindNotice(
        error instanceof Error
          ? error.message
          : "Could not find chats. Enter the chat ID manually.",
      );
    } finally {
      if (epoch === findEpoch.current) setFindBusy(false);
    }
  }
  return (
    <>
      <a className="skip-link" href="#bot-setup">
        Skip to bot setup
      </a>
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="#">
            <span className="brand-mark">
              <Hamster />
            </span>
            <span>
              Squeek <span className="brand-light">Alert Lab</span>
            </span>
          </a>
          <nav aria-label="Main">
            <a className="quiet-link help-link" href="#how-it-works">
              How it works
            </a>
            <a
              className="chain-link"
              href="https://squeekchain.com"
              target="_blank"
              rel="noreferrer"
            >
              Squeekchain
              <Icon name="external" size={14} />
            </a>
          </nav>
        </div>
      </header>
      <main className="page-container">
        <div className="intro">
          <div>
            <h1>Your bot. Your alerts.</h1>
            <p>Bring your own Telegram bot to the Squeekchain hamster wheel.</p>
          </div>
          <span className="browser-label">
            <Icon name="lock" size={16} />
            No backend. No account.
          </span>
        </div>
        <div className="workspace">
          <div className="configure-column">
            <section
              className="panel setup-panel"
              id="bot-setup"
              aria-labelledby="setup-title"
            >
              <div className="panel-heading">
                <h2 id="setup-title">
                  <span className="step">1</span>Bring your own bot
                </h2>
                <span
                  className={`status-label ${lab.active ? "positive" : ""}`}
                >
                  <span className="status-dot" />
                  {lab.active ? "Watching" : "Not watching"}
                </span>
              </div>
              <form onSubmit={watch} noValidate>
                <div className="setup-fields">
                  <div className="field">
                    <label htmlFor="bot-token">Telegram bot token</label>
                    <div className="token-field">
                      <input
                        ref={tokenRef}
                        id="bot-token"
                        name="bot-token"
                        type={showToken ? "text" : "password"}
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        placeholder="Paste your token from @BotFather"
                        value={settings.token}
                        disabled={lab.active || findBusy || lab.testPending}
                        aria-invalid={formError?.field === "token"}
                        aria-describedby={
                          formError?.field === "token"
                            ? "setup-error"
                            : "token-hint"
                        }
                        onChange={(event) => {
                          setSettings((previous) => ({
                            ...previous,
                            token: event.target.value.trim(),
                          }));
                          setChats([]);
                          setFindNotice("");
                          setFormError(null);
                        }}
                      />
                      <button
                        type="button"
                        className="reveal-token"
                        aria-label={
                          showToken ? "Hide bot token" : "Show bot token"
                        }
                        aria-pressed={showToken}
                        onClick={() => setShowToken((value) => !value)}
                      >
                        <Icon name="eye" size={18} />
                      </button>
                    </div>
                    <span className="field-hint" id="token-hint">
                      Create a bot with{" "}
                      <a
                        href="https://t.me/BotFather"
                        target="_blank"
                        rel="noreferrer"
                      >
                        @BotFather
                        <Icon name="external" size={12} />
                      </a>
                      .
                    </span>
                  </div>
                  <div className="field">
                    <div className="field-label-row">
                      <label htmlFor="chat-id">Chat ID</label>
                      <button
                        type="button"
                        className="inline-action"
                        onClick={() => void findChat()}
                        disabled={lab.active || findBusy || lab.testPending}
                      >
                        {findBusy ? "Finding…" : "Find chat ID"}
                      </button>
                    </div>
                    <input
                      ref={chatRef}
                      id="chat-id"
                      name="chat-id"
                      type="text"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="e.g. 123456789"
                      value={settings.chatId}
                      disabled={lab.active || findBusy || lab.testPending}
                      aria-invalid={formError?.field === "chatId"}
                      aria-describedby={
                        formError?.field === "chatId"
                          ? "setup-error"
                          : "chat-hint"
                      }
                      onChange={(event) => {
                        setSettings((previous) => ({
                          ...previous,
                          chatId: event.target.value.trim(),
                        }));
                        setFormError(null);
                      }}
                    />
                    <span className="field-hint" id="chat-hint">
                      Send /start to your bot first.
                    </span>
                  </div>
                </div>
                <div className="chat-discovery" role="status">
                  {findNotice}
                  {chats.length > 0 && (
                    <div className="chat-options">
                      {chats.map((chat) => (
                        <button
                          className="button secondary"
                          type="button"
                          key={chat.id}
                          onClick={() => {
                            setSettings((previous) => ({
                              ...previous,
                              chatId: chat.id,
                            }));
                            setChats([]);
                            setFindNotice(
                              `Chat ID selected for ${chat.label}.`,
                            );
                          }}
                        >
                          {chat.label} · {chat.id}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="form-error" id="setup-error" role="alert">
                  {formError && !["target", "rules"].includes(formError.field)
                    ? formError.message
                    : ""}
                </div>
                <div className="setup-actions">
                  <button
                    type="button"
                    className="button secondary"
                    disabled={lab.testPending || findBusy}
                    onClick={() => {
                      if (validate(false)) void lab.test(settings);
                    }}
                  >
                    <Icon name="telegram" size={18} />
                    {lab.testPending ? "Sending test…" : "Send test alert"}
                  </button>
                  <button
                    type="submit"
                    className="button primary"
                    disabled={findBusy}
                  >
                    <Icon name={lab.active ? "pause" : "play"} size={16} />
                    {lab.active ? "Stop watching" : "Start watching"}
                  </button>
                </div>
                <p className="field-hint open-reminder">
                  Alerts only fire while this page is open.
                </p>
                <div className="action-notice" role="status">
                  {lab.testNotice || lab.watchNotice}
                </div>
                {lab.active && (
                  <p className="field-hint edit-hint">
                    Stop watching to edit your bot or chat. Alert toggles stay
                    adjustable.
                  </p>
                )}
              </form>
              <div className="privacy-line">
                <Icon name="shield" size={18} />
                <p>
                  Your bot token is stored only in this browser.
                  <span>
                    It goes directly to Telegram when sending. No app server.
                  </span>
                </p>
              </div>
              {storageError && (
                <p className="error-text" role="alert">
                  {storageError}
                </p>
              )}
              {(settings.token || settings.chatId) && (
                <div className="forget-row">
                  {forgetting ? (
                    <>
                      <span>Remove saved bot details?</span>
                      <button
                        type="button"
                        className="text-button danger"
                        onClick={forget}
                      >
                        Forget bot
                      </button>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => setForgetting(false)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setForgetting(true)}
                    >
                      Forget saved bot
                    </button>
                  )}
                </div>
              )}
            </section>
            <section
              className="panel triggers-panel"
              aria-labelledby="triggers-title"
            >
              <div className="panel-heading">
                <h2 id="triggers-title">
                  <span className="step">2</span>Pick your squeeks
                </h2>
                <span className="count-label">{chosen} of 4 on</span>
              </div>
              <p className="section-description">
                Only the moments you care about.
              </p>
              <div className="trigger-list">
                {TRIGGERS.map((trigger) => (
                  <div
                    className={`trigger-item ${settings.rules[trigger.id] ? "enabled" : ""}`}
                    key={trigger.id}
                  >
                    <label
                      className="trigger-label"
                      htmlFor={`trigger-${trigger.id}`}
                    >
                      <span className={`trigger-icon ${trigger.id}`}>
                        <Icon name={trigger.icon} size={21} />
                      </span>
                      <span className="trigger-copy">
                        <strong>{trigger.title}</strong>
                        <span>{trigger.description}</span>
                      </span>
                      <input
                        id={`trigger-${trigger.id}`}
                        className="switch-input"
                        type="checkbox"
                        role="switch"
                        checked={settings.rules[trigger.id]}
                        onChange={(event) => {
                          setSettings((previous) => ({
                            ...previous,
                            rules: {
                              ...previous.rules,
                              [trigger.id]: event.target.checked,
                            },
                          }));
                          if (formError?.field === "rules") setFormError(null);
                        }}
                      />
                      <span className="switch-track" aria-hidden="true">
                        <span />
                      </span>
                    </label>
                    {trigger.id === "threshold" && (
                      <div className="target-row">
                        <label htmlFor="rpm-target">Your target</label>
                        <div className="target-field">
                          <input
                            ref={targetRef}
                            id="rpm-target"
                            name="rpm-target"
                            type="number"
                            inputMode="decimal"
                            min="0.001"
                            max="1000000"
                            step="any"
                            value={target}
                            disabled={!settings.rules.threshold}
                            aria-invalid={
                              settings.rules.threshold && !validTarget(target)
                            }
                            aria-describedby="target-error"
                            onChange={(event) => {
                              const value = event.target.value;
                              setTarget(value);
                              if (validTarget(value))
                                setSettings((previous) => ({
                                  ...previous,
                                  rules: {
                                    ...previous.rules,
                                    rpmTarget: Number(value),
                                  },
                                }));
                            }}
                          />
                          <span>RPM</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="error-text" id="target-error" role="status">
                {settings.rules.threshold && !validTarget(target)
                  ? "Enter a target greater than 0 and no more than 1,000,000 RPM. The last valid target stays active."
                  : formError?.field === "rules"
                    ? formError.message
                    : ""}
              </div>
            </section>
          </div>
          <aside
            className="observe-column"
            aria-label="Live Squeekchain status"
          >
            <section className="panel live-panel" aria-labelledby="live-title">
              <div className="panel-heading">
                <h2 id="live-title">Inside the wheel</h2>
                <span
                  className={`status-label ${statusFresh ? "positive" : ""}`}
                >
                  <span className="status-dot" />
                  {statusFresh
                    ? "Live feed"
                    : lab.statusError
                      ? "Feed unavailable"
                      : lab.status
                        ? "Stale feed"
                        : "Connecting"}
                </span>
              </div>
              <div className="wheel-display">
                <WheelArt sleeping={!running} running={running} />
                <div className="wheel-state">
                  <strong>
                    {statusFresh
                      ? running
                        ? "Up and running"
                        : "Taking a snooze"
                      : lab.statusError || lab.status
                        ? "Waiting for fresh data"
                        : "Meeting the hamster…"}
                  </strong>
                  <span>
                    {statusFresh
                      ? running
                        ? "Tiny paws. Actual work."
                        : "Even little legs need a break."
                      : "No guesses. Just the official feed."}
                  </span>
                </div>
              </div>
              <dl className="metrics">
                <div>
                  <dt>Wheel speed</dt>
                  <dd>
                    {format(statusFresh ? lab.status?.rpm : undefined, 3)}
                    <span>RPM</span>
                  </dd>
                </div>
                <div>
                  <dt>Current round work</dt>
                  <dd>
                    {format(statusFresh ? lab.status?.openWork : undefined)}
                    <span>units</span>
                  </dd>
                </div>
              </dl>
              <div className="round-line">
                <span>Latest settled round</span>
                <strong>
                  {settledThrough === undefined
                    ? "Awaiting history"
                    : `#${format(settledThrough)}`}
                </strong>
              </div>
              <div className="poll-line">
                <span>
                  <Icon name="refresh" size={14} />
                  {lab.polling
                    ? "Checking the wheel…"
                    : `Next poll in ${Math.max(0, Math.ceil((lab.nextPoll - lab.now) / 1000))}s`}
                </span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Refresh live status"
                  disabled={lab.polling}
                  onClick={() => void lab.refresh()}
                >
                  <Icon name="refresh" size={16} />
                </button>
              </div>
              <div className="feed-errors" role="status">
                {lab.statusError && <p>{lab.statusError}</p>}
                {lab.historyError && <p>{lab.historyError}</p>}
              </div>
              <a
                className="source-link"
                href="https://api.squeekchain.com/v1/status"
                target="_blank"
                rel="noreferrer"
              >
                Official Squeekchain API
                <Icon name="external" size={12} />
              </a>
            </section>
            <div className="open-note">
              <span className="note-icon">
                <Icon name="help" size={20} />
              </span>
              <div>
                <h3>Keep this little lab open</h3>
                <p>
                  Alerts only fire while this page is open. Browsers may slow
                  polling in background tabs or suspend it when your device
                  sleeps.
                </p>
                <span>Live polling every 15 seconds.</span>
              </div>
            </div>
          </aside>
        </div>
        <section className="panel log-panel" aria-labelledby="log-title">
          <div className="panel-heading log-heading">
            <h2 id="log-title">
              <Icon name="history" size={21} />
              Alert log<span className="log-count">{sentCount} sent</span>
            </h2>
            <div className="log-controls">
              <label className="sr-only" htmlFor="log-filter">
                Filter alert log
              </label>
              <select
                id="log-filter"
                value={logFilter}
                onChange={(event) => setLogFilter(event.target.value)}
              >
                <option value="all">All alerts</option>
                <option value="sent">Sent</option>
                <option value="failed">Failed</option>
              </select>
              <button
                type="button"
                className="text-button"
                onClick={lab.clearLog}
                disabled={lab.logs.every(
                  (entry) => entry.delivery === "sending",
                )}
              >
                Clear log
              </button>
            </div>
          </div>
          {logItems.length === 0 ? (
            <div className="empty-log">
              <span className="empty-bell">
                <Icon name="bell" size={28} />
              </span>
              <strong>
                {lab.logs.length
                  ? "No alerts match this filter"
                  : "A quiet wheel, for now."}
              </strong>
              <p>
                {lab.logs.length
                  ? "Choose All alerts to see the rest of your log."
                  : "Send a test alert or start watching. Your alerts will land here."}
              </p>
            </div>
          ) : (
            <ol className="alert-list">
              {logItems.map((entry) => (
                <li key={entry.id} className="alert-row">
                  <span className={`log-icon ${entry.delivery}`}>
                    <Icon
                      name={
                        entry.delivery === "sent"
                          ? "check"
                          : entry.delivery === "failed"
                            ? "help"
                            : "telegram"
                      }
                      size={18}
                    />
                  </span>
                  <div className="alert-content">
                    <div className="alert-title">
                      <strong>{entry.title}</strong>
                      <span className={`delivery ${entry.delivery}`}>
                        {entry.delivery === "sent"
                          ? "Sent to Telegram"
                          : entry.delivery === "failed"
                            ? "Failed"
                            : "Sending…"}
                      </span>
                    </div>
                    {entry.error && <p className="error-text">{entry.error}</p>}
                    <details>
                      <summary>View message</summary>
                      <p className="message-preview">{entry.message}</p>
                    </details>
                  </div>
                  <div className="alert-meta">
                    <time
                      dateTime={new Date(entry.at).toISOString()}
                      title={new Date(entry.at).toLocaleString("en-GB")}
                    >
                      {localTime(entry.at)}
                    </time>
                    {entry.delivery === "failed" && (
                      <button
                        className="text-button"
                        disabled={
                          (!!entry.retryAt && lab.now < entry.retryAt) ||
                          !!credentialsError(settings)
                        }
                        onClick={() => void lab.retry(entry)}
                      >
                        {entry.retryAt && lab.now < entry.retryAt
                          ? `Retry in ${Math.ceil((entry.retryAt - lab.now) / 1000)}s`
                          : "Retry alert"}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
          <div className="log-footer">
            <span>Local time · This session only · Latest 100 alerts</span>
            <span>No alert history is uploaded.</span>
          </div>
        </section>
        <section
          className="how-section"
          id="how-it-works"
          aria-labelledby="how-title"
        >
          <div className="how-intro">
            <h2 id="how-title">A bot that’s yours.</h2>
            <p>
              You own the bot, choose the events, and receive the alerts. This
              is your personal toolkit for the wheel.
            </p>
          </div>
          <ol className="how-steps">
            <li>
              <span>01</span>
              <div>
                <h3>Create your bot</h3>
                <p>
                  Open{" "}
                  <a
                    href="https://t.me/BotFather"
                    target="_blank"
                    rel="noreferrer"
                  >
                    @BotFather
                  </a>{" "}
                  in Telegram, send /newbot, and copy your token.
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <h3>Say hello</h3>
                <p>
                  Send /start to your new bot. Paste its token above, then use
                  Find chat ID. Groups need the bot added; channels need posting
                  permission.
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <h3>Make it squeek</h3>
                <p>
                  Send a test, pick your triggers, and start watching. Keep one
                  watching tab open. New events go straight to your Telegram
                  chat.
                </p>
              </div>
            </li>
          </ol>
        </section>
      </main>
      <footer className="site-footer">
        <span>
          <span className="footer-seed" aria-hidden="true">
            <Icon name="seed" size={16} />
          </span>
          Made for the little wheel.
        </span>
        <span>Squeek Alert Lab · A community toolkit</span>
        <a
          href="https://api.squeekchain.com/v1/settlements?range=24h"
          target="_blank"
          rel="noreferrer"
        >
          Round history
          <Icon name="external" size={12} />
        </a>
      </footer>
    </>
  );
}

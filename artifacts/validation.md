# Squeek Alert Lab — worker validation

Validated **2026-11-04** against the finished production export. These are worker observations, not independent certification. The assignment uses the `none` verifier profile; file/path verification does not certify behavior.

| Area                                          | Final observation                                                                |
| --------------------------------------------- | -------------------------------------------------------------------------------- |
| Brief and acceptance coverage                 | 21 grouped requirements met; 0 missing; 0 implemented as simulated live features |
| Broken primary features                       | 0 observed in the recorded checks                                                |
| Product and main action on first 390px screen | Yes; Start watching occupies approximately y=510–558 at 390×844                  |
| Pinned taste@1                                | 16/16 checks passed                                                              |
| Remaining copy findings                       | 0 observed                                                                       |
| Share card                                    | Present, locally bundled, 1200×630 PNG; visually inspected                       |

The visual idea is **a personal night-time hamster lab: flat dark panels, a warm amber watching action, and the retained Squeek hamster identity**.

## Scope and consequential assumptions

This job adapts the existing React/TypeScript/Vite project into the requested single-page Alert Lab. The local font and original hamster are retained. The prior prediction-game and wallet runtime/UI, stale screenshots and obsolete wallet assets are removed because they do not belong to this requested tool. Existing build configuration, manifest, dependency lockfile and dependencies are unchanged. No chain deployment, wallet connection, account, application backend or publication is part of the implementation.

“Token never leaves the browser” is interpreted as **no token upload to an application server or intermediary**. Delivering Telegram alerts necessarily sends the token directly to Telegram. Both UI and README make that distinction explicit. Credentials are end-user configuration, not a missing deployment secret. No real recipient or bot token was invented for the app.

All four triggers default on. Threshold crossings work in both directions, starting at 500 RPM. Initial observations establish baselines, not retroactive notifications. A page opened at 0 RPM has not observed a transition back to sleep. A >45-second observation gap, failed/stale status, or installation change rebaselines the wheel. Watch state and alert history are session-only; saved settings do not automatically arm a reopened page. Safe checkpoint ranges supplement active settlements, without inventing per-round batch work. The display and alerts use actual APIs; only tests intercept them.

## Requirement coverage

| Requirement from the brief                                           | Implemented evidence                                                                       |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| “single-page web app called Squeek Alert Lab”                        | Header, metadata and one-page application in `src/App.tsx`                                 |
| “bring-your-own-bot toolkit”                                         | Token/chat setup, independent trigger settings and own-bot onboarding                      |
| “Send test alert” and link to @BotFather                             | Form action and onboarding links; direct Telegram send; optional recent-chat discovery     |
| “hamster wake-up (RPM 0 → above 0)”                                  | `observeWheel`; browser and unit transition checks                                         |
| “hamster sleep … 5+ minutes”                                         | 300,000ms of consecutive observed zeros after a stop; tested with controlled time          |
| “new round settled”                                                  | Safe settlement/checkpoint high-water tracking and deduplication                           |
| “RPM threshold crossing … default 500”                               | Labeled editable target and up/down comparisons                                            |
| “current wheel state … RPM … current round work … polling indicator” | Official measurements, open-round work, live/stale/error states, countdown and refresh     |
| “poll the API every 15 seconds”                                      | `POLL_MS=15000`, status plus 24h settlements; actual poll counts tested                    |
| “send alerts via … sendMessage”                                      | `src/lib/telegram.ts`; direct form-encoded POST, no referrer/cookies                       |
| “Alert log … timestamps”                                             | Session list, delivery states, local timestamps, message disclosure, retry/filter/clear    |
| “token … localStorage only” and privacy UI                           | Dedicated storage key, masked input, browser-only storage disclosure, confirmed forgetting |
| “alerts only fire while the page is open”                            | Reminder beside primary actions and expanded background-tab explanation                    |
| “dark mode … full English … mobile responsive”                       | One deliberate dark theme, English UI and responsive layouts                               |
| “dist/index.html … source and lockfile … relative asset URLs”        | Complete `dist/`, source, existing unchanged package manifest/lock; subpath browser tests  |
| “production build, typecheck and useful interaction validation”      | Passed commands and counts below; raw results retained                                     |
| “Better Interface … six domains … findings and limitations”          | All six core domain guides read and applied; consolidated review below                     |
| “first screen at 390 … product and main action”                      | Screenshot and measured 48px action at y≈510–558                                           |
| “title, favicon, description, og:title and og:image”                 | Final HTML and local favicon/share asset; probe passed                                     |
| “DESIGN.md at the repository root”                                   | Final source tokens, typography, layouts, components and states documented                 |
| “README … install, preview and rebuild”                              | Normal npm commands, behavior, privacy, validation and limits documented                   |

## Commands and actual results

| Command / check                                                                   | Actual result                                                                                                                      |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck` in a clean source copy                                        | Exit 0; TypeScript 5.9.3, ordinary `tsc --noEmit` without custom compiler paths                                                    |
| `npm test`                                                                        | Exit 0; 19/19 API/alert tests passed                                                                                               |
| `npm run build` in the clean source copy                                          | Exit 0; Vite 8.3.5; 22 modules; HTML, one CSS and one JS bundle plus public assets                                                 |
| `diff -qr dist <clean-copy>/dist`                                                 | Exit 0; byte-identical production export                                                                                           |
| `node tests/browser.mjs` with external dependency resolution                      | Exit 0; 21/21 scenarios, 11 Chromium and 10 WebKit                                                                                 |
| `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | Exit 0; 16/16 passed at 320, 390 and 1440px, including the reduced-motion pass                                                     |
| Axe in each engine's default state                                                | Zero reported violations                                                                                                           |
| Live production page through browser tool                                         | Both Squeekchain requests HTTP 200; zero console errors/warnings; screenshot inspected                                             |
| Rendered metric sampling                                                          | 390×844 main action/reminder visible, local font loaded, six measured text pairs pass; refresh preserves a 10s remaining countdown |
| `git diff --check`                                                                | Passed at final cleanup                                                                                                            |

Dependencies were installed outside the repository. The workspace build used the existing Vite configuration's supported external-dependency resolver. A clean source copy was then built using ordinary package resolution and the commands above, with the necessary packages installed in its parent temporary toolchain. The package manifest and lockfile in the submission were never edited. This is not a claim that `npm ci` was run inside the protected workspace.

WebKit initially failed its host-library check and then EGL display creation. It completed after supplying temporary runtime libraries, software rendering and disabling its GPU compositing path. No browser binaries, runtime libraries, installed dependencies or caches are included. Browser scenarios use accelerated clocks, not real five-minute waits.

`artifacts/results.json` retains the browser scenario outcomes and every final probe check. `artifacts/unit-results.txt` retains the unit output. `artifacts/rendered-metrics.json` records computed color pairs, font status and first-screen geometry. Source test utilities remain in `tests/`; no fixture or test credentials are bundled into `dist/`.

## Interaction validation

Both engines completed setup validation and focus-to-error; token reveal/hide; direct test POST and acceptance; credential persistence with sending paused on reload; cancel/confirm forgetting; wake-up and threshold crossings up and down; repeated-poll suppression; independent toggles; stop; five-minute sleep and one-shot/reset behavior; safe round confirmation and duplicate suppression; history-only outage while wheel alerts continue; stale/status outage and long-gap rebaseline; token rejection; manual retry; 429 cooldown; alert filtering/clearing; single/multiple/empty chat discovery, 100-character unbroken chat-name wrapping and webhook conflict; no-selected-trigger and invalid-target validation; keyboard switch/form/start/stop; a deliberately held pending test send; ambiguous network failure and keyboard retry. Chromium also checked that a second tab cannot own the watching lock until the first stops.

The test suite checks local script/resource failures and serves the actual export under `/preview/`. It verifies no token-bearing request goes anywhere except Telegram and no token is inserted in message text. Real Telegram traffic is intercepted. Success means a correctly handled API acceptance response, not proof of real chat receipt.

## Better Interface review: six domains

| Domain        | Checked evidence                                                                                                                                                                                                                                            | Limits / not applicable                                                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accessibility | Native forms/buttons/switches/select/details; labels and error associations; invalid-field focus; visible amber focus screenshot; Space/Enter flows; pending/disabled states; default-state Axe in both engines; static state text and reduced-motion check | No screen-reader session, physical touch device or rendered forced-colors test. No dialogs/focus trap needed. Passing Axe is not full compliance. |
| Layout        | DOM reading order; shared edges; 320, 390, 560, 740, 800, 900, 1120 and 1440px; no horizontal overflow; full/mobile screenshots; 200% text enlargement and RTL mirror in both engines                                                                       | Native browser zoom and translated/localized strings unperformed. English-only is intentional.                                                    |
| Writing       | Own-bot differentiator first; clear verbs; trigger ON-state descriptions; field errors and retry instructions; explicit storage/direct Telegram/open-page boundaries; empty log tells how to populate it                                                    | No translation or copy testing with external users.                                                                                               |
| Typography    | One local loaded font; three used weights; declared six-step scale; probe observes five repeated sizes per width; tabular metrics; wrapping at every tested width; 16px fields                                                                              | No physical iOS keyboard/zoom test.                                                                                                               |
| Colors        | Semantic tokens, opaque rendered surfaces, pinned probe contrast pass; primary action 9.66:1, heading 16:1, supporting copy 8.32:1, field hint 7.42:1, live status 9.09:1, input text 16:1                                                                  | Ratios are sampled computed pairs in the default state, not an audit of every possible state. No light theme requested.                           |
| UI details    | Flat bordered panels, one filled primary action; neutral secondary actions; hover/pressed/focus/loading/empty/error/success/retry/cooldown states; held-pending browser case; no continuous animation; reduced motion gives zero animations                 | No slowed browser Animations-panel session; there are only brief 120ms transitions and no staged animation. Native device feel unverified.        |

The final taste@1 results: render, layout, targets, contrast, casing, tracking, eyebrows, type sizes, type faces, glyphs, slogans, repetition, copy budget, chrome, motion and share all passed. The probe counted nine controls below the comfortable 44px size, but no target-spacing failures. Mobile first-screen prose is 49 words, within its 60-word bar. There are no hidden text clips, nested cards, panel border/shadow combinations, gradient text, repeated lines or running reduced-motion animations in the measured default state.

## Findings fixed and rechecked

All locations refer to final source, not built/minified bundles. These were implementation review corrections; none remains an observed blocker.

1. **Medium / writing and layout — open-page constraint too far from the action.** Source: `src/App.tsx:403`, `className="field-hint open-reminder"`. Before: the expanded limit was with the live panel, below the setup on a phone. Change: add “Alerts only fire while this page is open” immediately after the setup actions; privacy follows naturally below. Why: this directly governs whether alerts work. Reproduce at 390×844 before scrolling. Recheck: final mobile screenshot and computed reminder bottom ≈588px show it above the fold.
2. **Medium / UI — a completed test notice obscured start/stop feedback.** Source: `src/lib/useLab.ts:213` and `:228`, `setTestNotice("")`. Before: the UI's test-notice priority could leave “Test alert sent” visible after starting watching. Change: clear test feedback on start and stop, exposing the watching/baseline notice. Why: actions need current feedback. Reproduce by sending a test then starting. Recheck: source state reset, test-to-start keyboard scenario and start/stop flows pass in both engines.
3. **Medium / UI — manual refresh shifted the displayed polling deadline.** Source: `src/lib/useLab.ts:297`, scheduled `setNextPoll` in the interval rather than every manual poll. Before: refreshing midway reset the countdown to 15s even though the next scheduled poll was sooner. Change: preserve the actual interval deadline during manual refresh. Why: the polling indicator must describe the real schedule. Recheck: after five controlled seconds, refresh leaves “Next poll in 10s” unchanged; recorded in rendered metrics.
4. **Medium / correctness — concurrent API responses could compare different installations.** Source: `src/lib/useLab.ts:178`, `await statusTask`, followed by installation comparison and cancellation check. Before: faster history could be compared with the preceding status installation. Change: fetch both concurrently but finish the current status check before evaluating history identity. Why: a source change must not create a false new-round notification. Recheck: source review, unit installation resets and browser status/history outage recovery; the precise network-response race was not separately injected.
5. **Low / UI — a delayed chat lookup could refill a forgotten chat ID.** Source: `src/App.tsx:143`, `:171`, `findEpoch` invalidation/guard. Before: lookup completion could update settings after forgetting them. Change: invalidate pending lookup results when forgetting and check the operation epoch on completion/error. Recheck: source control-flow review; normal discovery and forget interactions pass. The exact delayed-lookup/forget race was not separately injected.

6. **Low / layout — unbroken Telegram chat names could overflow lookup feedback.** Source: `src/style.css:452`, `.chat-discovery { overflow-wrap: anywhere; }` (shared with the action notice). Before: a long unbroken returned name had no wrap opportunity. Change: allow arbitrary name wrapping within the notice. Reproduce with a 100-character unbroken chat name at 390px. Recheck: explicit no-overflow assertion in the final chat-discovery scenario passed in Chromium and WebKit; production build and probe rerun after the correction.

## Evidence

- `screenshots/mobile-first-screen.png`: final 390×844 default state, controlled API fixture; inspected directly. Shows product, setup, actions, open-page note and privacy before scrolling.
- `screenshots/mobile-focus.png`: same width, visible keyboard-style token-field outline; inspected directly.
- `screenshots/desktop-live.png`: final 1280px production export using the actual public APIs, refreshed with direct Chromium after the final CSS correction; inspected directly. The browser tool also inspected the live production page and its requests.
- `../public/share.png`: final original 1200×630 social card, inspected directly.

Controlled fixture screenshots are layout evidence, not claimed live telemetry. The desktop image is the live-source smoke evidence. Probe screenshots remain disposable in `test/scratch/taste/shots/` and are not required to run the site.

## Explicit path budget and packaging

A new root `.gitignore` is needed because the local Git exclusion rules otherwise omit `artifacts/`. Its overrides include only the delivery trees; later rules exclude dependency/cache trees at every depth. No existing ignore file or Git internals were edited.

| Allowed delivery path | Maximum final content bytes |
| --------------------- | --------------------------: |
| `.gitignore`          |                         512 |
| `dist/`               |                     700,000 |
| `artifacts/`          |                   1,100,000 |
| `src/`                |                     200,000 |
| `tests/`              |                     100,000 |
| `public/`             |                     200,000 |
| `README.md`           |                      20,000 |
| `DESIGN.md`           |                      20,000 |
| `docs/`               |                      30,000 |
| **Budget total**      |               **2,370,512** |

All are below the 8,388,608-byte assignment cap even at their budgets. `artifacts/bundle-budget.json` records measured final sizes. Unchanged manifest/lock/configuration are retained; they add no changed content to the bundle. No `node_modules`, package cache, vendored registry, dependency archives, submodule, source maps or obsolete wallet chunks remain in the export. The two required runtime assets (font and share PNG) remain complete and local. No ignore change hides required source or export files.

## Limitations and completion

**Complete for the stated implementation and worker-check scope.** There is no unresolved observed primary-interaction failure.

Actual Telegram acceptance/chat delivery using a real bot, physical phones, screen-reader sessions, browser-native zoom, forced-colors rendering, and real hardware sleep/threshold events were not verified. WebKit testing approximates its engine, not a physical Safari/iPhone session. API availability and Telegram/CORS/service policy are external dependencies. Browsers can throttle background tabs or suspend sleeping devices; no closed-page or complete historical-backlog delivery is promised. Telegram timeout/network failure can be ambiguous, so manual retry can duplicate an accepted message. These boundaries are disclosed in the product and README.

# Squeek Streak

A single-page prediction game for the real Squeekchain hamster wheel. Pick the **next** 10-minute round’s work band, stake free SP, build a streak, or challenge a second wallet. Duels and scores belong to a disclosed local league in this browser.

The complete static website is in **`dist/`**. It includes all fonts, illustrations, wallet marks, the favicon, and the social card. No build server, API key, relay, or WalletConnect project ID is needed to serve it.

## Install, run, and rebuild

Use Node.js 22.12+ or 24+ and npm.

```sh
npm ci
npm run dev
```

Build and preview the production export:

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

Open the URL printed by Vite. For deployment, serve the **contents of `dist/`** using a static host. `vite.config.ts` sets `base: './'`; asset URLs work under a gateway subpath. Navigation uses page anchors and local state, with no server route rewrites. Opening `index.html` using `file://` is unsupported because module scripts, API requests, and wallet sessions require an HTTP origin. Use HTTPS for public hosting; HTTP localhost is supported for development.

Browser validation, after building:

```sh
npx playwright install chromium webkit
npm run test:browser
```

Playwright may also require its platform browser libraries (`npx playwright install-deps`). Tests manage their own temporary HTTP server under `/preview/` and close it on completion. Test reports and screenshots go to `test/scratch/`; nothing there is needed to build or serve the game. Test wallets are generated in memory and never saved as keys. API fixtures exist only in the test code and are never bundled into the website.

## What is implemented

- **Live wheel:** official state, RPM, speed, current-round work, cumulative work, settled-through count, and a 10-minute countdown.
- **Four bands:** Sleep = 0; Stroll = 1–99; Run = 100–499; Sprint = 500+ work units.
- **Solo predictions:** 1,000 starting SP, stakes of 10–500 SP, one immutable pick per player per round.
- **Streak returns:** successive wins pay 2×, 2.25×, 2.5×, 2.75×, then 3×. Returns include the stake, round down to whole SP, and are determined in round order. Losing resets the solo streak; refunds preserve it.
- **Two-wallet duels:** two different signed-in wallets stake the same SP on different bands for one round. The correct player receives the whole 2× pot. If neither is correct, both get their stakes back. Unmatched duels refund at the round start; the creator can cancel an unmatched challenge. Duels do not alter solo streaks.
- **Weekly leaderboard:** settled net profit, resetting Monday at 00:00 UTC, excluding starting points, relief, and unsettled stakes. Player names open their prediction history.
- **History:** per-player filters, pending/won/lost/refunded states, and a CSV download of the signed-in player’s history.
- **Daily relief:** 300 SP when the balance is below 300 SP, once per UTC day, resetting at 00:00 UTC.
- **Wallet login:** EIP-6963 discovery, an injected-provider fallback, mobile wallet browser links, and Coinbase Wallet/Smart Wallet. Login uses a unique, origin-bound, expiring message signature that is verified before activating the local player. No transaction, approval, or chain-switch request is made by the app.

SP has no monetary value. Guest practice is usable without a wallet and has its own points; duels require signed wallet identities.

## Live data and settlement

The app polls these public endpoints every 15 seconds while visible and refreshes on return to the tab:

- [Official status API](https://api.squeekchain.com/v1/status): `measurement.coreStatus`, `rpmMilli` (divided by 1,000 for RPM), `speedMmPerSecond`, `cumulativeWorkUnits`, and `builder.queued.openRoundWorkUnits`.
- [Official settlement history](https://api.squeekchain.com/v1/settlements?range=24h): safe settlement records and mining checkpoints. `mining.nextRound.round` and `startsAt` anchor the round numbering and 600-second schedule.

Only **exact, confirmed round work** can settle a pick. A safe single-round `workAdded` is accepted. Consecutive safe mining checkpoints can prove a round’s cumulative-work difference, including zero-work rounds absent from the active settlement list. A confirmed zero-work batch can prove that each included round slept. Nonzero multi-round batches, unsafe records, missing values, and cross-installation records are never guessed or split.

When an exact result is unavailable for **20 minutes after the target round ends**, its stake refunds automatically. On reopening, the initial history request completes (or fails/times out) before a missing-data refund. An exact result whose API confirmation timestamp is at or before the deadline settles a pending solo pick or matched duel even on a later visit. Settlement checks run every five seconds while open; a closed static page cannot run a background job. Completed refunds remain final. A changed API installation also refunds affected picks. Out-of-order solo results wait for that player’s earlier result or refund, preserving correct streak multipliers without blocking other players.

The device’s UTC clock aligns to the official round anchor. A stale/offline status, unavailable anchor/history, or a clock more than two minutes away from the API timestamp pauses new picks. Cached responses cannot rewind the countdown or reopen a round. Previously shown metrics stay labeled **Paused** on a feed failure; no fabricated live data is substituted. When only status is unavailable, safe settlement history can still resolve pending picks without enabling new ones.

## Local league boundary

**This is a static, browser-local game.** Points, duels, history, names, and rankings live in localStorage on the current origin. Wallet signing proves ownership for the local session; it does not create a server account or sync points between devices. The interface states this in the league and duel views and the rules.

For a duel, create a challenge, pass the same browser/device to a friend, switch or disconnect the wallet, and have the friend sign in, pick a different band, and join. Tabs on the same origin share the league; Web Locks serialize supported-browser writes. There is no remote matchmaking, global ranking, cross-device escrow, or server-enforced anti-cheat. Clearing site storage resets the league. A wallet starts with its own 1,000 SP; guest points are separate. Signature sessions last up to 24 hours and are checked on reload and account changes. Smart-contract signature verification uses Ethereum Mainnet; the real Coinbase passkey/app flow remains an integration check for a live wallet.

A global competitive league would require a trusted persistence and authentication service. No such service or credentials were supplied, so none is invented or implied.

## Validation performed

The production export was built and tested on **2026-11-02**:

| Check | Actual result |
| --- | --- |
| Production build | Passed; relative export in `dist/` |
| TypeScript (`tsc --noEmit`) | Passed |
| Game/API unit tests | 28/28 passed |
| Production browser scenarios | 13/13 passed across Chromium and WebKit |
| Axe accessibility scan | No violations in the inspected main state |
| Pinned taste@1 probe | 16/16 passed at 320, 390, and 1440 px |
| Additional reflow | No horizontal overflow at 740 or 900 px; 200% text sizing at 390 px passed |
| Real API smoke check | Both official endpoints answered; live export rendered with no script errors or missing resources |

Browser scenarios cover prediction validation and persistence, exact settlement, streak payout, duplicate prevention, CSV/history/leaderboard, API-down refunds, settlement during a status-only outage, daily relief, name editing, EIP-6963 signature verification, rejected-signature retry, account switching, a complete two-wallet duel, keyboard dialog focus and return, running wheel metrics, reduced motion, and recovery after API failure. Round waits use a controlled browser clock, not real 10-minute sleeps.

Revision regressions also cover reopening after the refund deadline, delayed initial history, timely winning and losing results, late/missing data, matched-duel payouts, refund finality, and 24-character player names at 320–1440px. The corrected local share card was inspected directly. All three reviewer findings and their rechecks are recorded in [.imd-responses.json](.imd-responses.json).

Checks used direct Playwright Chromium and WebKit. WebKit used temporary external runtime libraries; both browsers completed their scenarios. No machine dependencies or caches are included in the delivery. The build emits one benign dependency warning about an unused Node worker module in Ox; the tested browser bundle has no corresponding runtime failure.

Real wallet extensions, physical phone app handoffs, Coinbase passkey creation, screen-reader sessions, and browser-native zoom were not tested. Emulated viewports and 200% CSS text enlargement are not physical-device or native-zoom tests. These results are worker observations, not an independent certification. Detailed coverage, fixed findings, evidence, and remaining limitations are in [docs/validation.md](docs/validation.md).

## Source map

| Path | Purpose |
| --- | --- |
| `src/App.tsx` | Play screen, league/history, rules, relief, profile flows |
| `src/lib/api.ts` | Official API normalization, safe result extraction, round timing |
| `src/lib/game.ts` | Points ledger, solo/duel settlement, streaks, relief, profit |
| `src/lib/hooks.ts` | Polling, clock, persisted state, cross-tab synchronization |
| `src/lib/wallet.ts` | Connector config, signed session verification, phone links |
| `src/components/` | Wallet sheet, native dialog, hamster artwork and icons |
| `src/style.css` | Color/type tokens, component states, responsive layout |
| `tests/` | Portable unit and production-browser validation |
| `public/` | Local runtime assets copied to `dist/` |

[DESIGN.md](DESIGN.md) describes the final visual system and its reuse points. [Third-party notices](docs/THIRD_PARTY_NOTICES.md) link the retained licenses under `docs/` and `public/`.

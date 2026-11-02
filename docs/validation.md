# Worker validation and design review

Date: **2026-11-02**. This is a record of checks performed by the implementer, not an independent certification. The exact production export is `dist/`; the final source is in `src/`.

## Revision results

All three reopened findings reproduced and were fixed without changing the established design, dependencies, wallet integration, or local-league rules. The sections after this revision record retain the original implementation evidence; the results here and in `validation-results.json` supersede the original test counts and export hashes.

| Finding / final source | Reproduction before the fix | Fix and production recheck |
| --- | --- | --- |
| High: settlement on reopening, `src/lib/game.ts:247` and `src/App.tsx:153` | At 390×844, a 100 SP Run or Sleep pick for #102 was refunded to 1,000 SP at 12:40:00.001Z despite a safe 280-work result timestamped 12:20:01Z. Four new unit regression groups failed, including matched duels and streak ordering. | Exact results confirmed at or before round end + 20 minutes take precedence over refunds for pending solo picks and matched duels. The initial feed/history attempt must finish before a missing-data refund, and caching/settlement share one effect. With initial history held across a five-second timer, the ledger remains pending and unchanged until the response. Run then pays 200 SP, balance 1,100, streak 1; Sleep loses, balance 900. A matched two-wallet duel pays the host 200 SP, with host/guest balances 1,100/900. |
| High: long-name reflow, `src/style.css:1931` | At 320×844, 24 W characters expanded the filters to 298px within a 264px toolbar; document width was 326px. | In the existing mobile media rule, the filters use `flex: 1 1 100%` and `min-width: 0`; the first label also permits shrinking. Recheck: 264px filters inside x=28..292, document width 320px, both selectors operable, CSV below. Also passed at 390/440/740/1440px. |
| Medium: flattened broken logo, `public/share.png` (metadata: `index.html:21`) | Native-size inspection confirmed a broken-image glyph inside the 48px logo box in both PNGs. | Embedded and decoded `public/favicon.svg` at the existing logo position before recapturing the 1,200×630 card. The remaining image composition is preserved. Visually inspected the corrected PNG; `public/share.png` and `dist/share.png` match byte for byte. |

The confirmation cutoff is inclusive. Unit coverage checks timestamps one millisecond before, at, and after it for both modes; a later observation does not change that cutoff. Missing and late-confirmed results still refund, chronological solo streak returns remain correct, and completed refunds are never reversed.

| Executed revision check | Actual result |
| --- | --- |
| `npm run typecheck` in a clean source copy with the locked external toolchain | Exit 0, TypeScript 5.9.3 |
| `npm test` in that copy | Exit 0, **28/28 passed** (23 existing and five new groups) |
| `npm run build` in that copy | Exit 0, Vite 8.3.5; copied that exact export to `dist/` and verified all 14 exported files match |
| `node tests/browser.mjs` against the submitted `/preview/` export | Exit 0, **13/13 scenarios passed**, Chromium and WebKit; no reported script errors; axe scan passed |
| `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | Exit 0, **16/16 passed** at 320/390/1440px; no local resource failures, horizontal overflow, overlapping/clipped text, or failed measured text contrast |
| Direct rendered/image inspection | Viewed fresh 390px and 1440px probe screenshots, the long-name 320px screenshot, and the corrected social PNG. Product and Lock prediction remain on the 390px first screen. |
| Delivery integrity | Public assets match exported copies; ordinary build matches the submitted export; package manifest/lockfile unchanged; no ignore-file, dependency/cache, or registry-archive additions |

Dependency installation and build tools stayed in a temporary directory outside the repository. Browser execution used Playwright 1.64.1 with Chromium and WebKit; WebKit loaded temporary external runtime libraries without bypassing the host check in this revision. The existing unused Ox `node:worker_threads` externalization warning remains; the checked browser bundle has no corresponding error. All round waits use a controlled clock.

### Better Interface revision coverage

Read the pinned workflow, all six domains' core principles, and documentation method. Scope was the changed settlement/loading states, mobile filters, and social asset, with the existing main flow rerun for regressions.

| Domain | Coverage and limits |
| --- | --- |
| Accessibility | Checked native selector names and operation, existing keyboard/dialog flow, focus return, reduced motion, and axe scan. Screen-reader sessions and physical device input remain unperformed. |
| Layout | Checked the longest permitted name at 320/390/440/740/1440px, normal reflow including 900px, and the 390px primary action. No overflow was hidden. Browser-native zoom and physical safe areas remain unverified. |
| Writing | Source-reviewed the existing Player/Result/CSV labels, settlement outcomes and refund reason; retained the established terms and game copy. No new product copy or localization was introduced. |
| Typography | Retained the source type scale, weights, local font and numeric styles. Fresh probe passed; viewed actual long-name selector rendering. Full values remain available in the native option list and profile editor. |
| Colors | Tokens unchanged; fresh probe's measured text contrast passed. No new contrast ratios are inferred for unmeasured states or themes. |
| UI | Walked delayed history, reload, win/loss/refund, matched duel, filter, and empty-history states. Visually confirmed the corrected share-card mark. Animations-panel slow replay and real social-platform unfurling were not performed. |

[320px long-name regression screenshot](images/revision-history-320.png) shows both filters and CSV inside the page. The corrected share card itself is delivered at `public/share.png` and `dist/share.png`. Machine-readable finding responses are in the root `.imd-responses.json`.

Reopening and long-name regression scenarios ran in Chromium. WebKit reran the existing mobile prediction and wallet-sheet scenario. Real extension prompts, app handoffs, passkey onboarding, screen readers, and native zoom remain outside this revision's verification. The static browser-local league limitation remains explicit. **Complete for the stated revision scope.**

## Scope and assumptions

Squeek Streak is a single-page, English-language prediction game using the real official Squeekchain API and free SP points. The one visual idea is an illustrated hamster economy: pale green wheel enclosure, cream work surfaces, seed-orange actions, and compact live data around the prediction control.

The static delivery has no shared backend. Accordingly, duels and rankings form a **local league on this browser/origin**, stated in the UI, rules, and README. Two different verified wallets can compete using that league; guest practice has an independent balance. No leaderboard rows, wheel telemetry, remote opponents, or successful wallet connections are seeded into the production application.

Ordinary rule choices made explicit in the game: stakes 10–500 SP; streak returns 2× to 3× inclusive of the stake; missing-data grace 20 minutes; relief below 300 SP, once per UTC day; week starts Monday 00:00 UTC; different bands required in duels; neither correct means both refunded. Wallet sessions expire after 24 hours. Physical app behavior and server-enforced competition are outside the verified scope.

## Requirement coverage

| Brief requirement | Result and evidence |
| --- | --- |
| “single-page prediction game called Squeek Streak” | Met: game form and live panel in `src/App.tsx`; one exported HTML entry |
| “NEXT 10-minute round” and four bands | Met: API round anchor plus 600-second intervals; exact band boundary unit tests; browser pick targets #102 while current round is #101 |
| “real settled round work” from official APIs | Met: real endpoint smoke checks and rendered live export; `src/lib/api.ts` only accepts safe exact results |
| “Auto-refund when round data is missing” | Met: full refund after 20-minute grace, preserved streak, idempotence, unavailable-feed browser test |
| “streak multiplier” | Met: sequential 2/2.25/2.5/2.75/3× returns; six-win and loss-reset unit tests; browser confirms balance and next multiplier |
| “1v1 duel” and “winner takes the pot” | Met in the disclosed local league: two generated wallets sign valid messages; equal stakes reserved; winner/loser balances 1,100/900 verified after a 200 SP pot settlement |
| “weekly net-profit leaderboard and per-player prediction history” | Met in the disclosed local league: Monday UTC profit, no relief/start/pending inflation; player selection, result filter, row history and CSV validated |
| “300 SP daily relief” and “start 1,000 SP” | Met: threshold, day reset and duplicate claim tests; browser claim changes 100 to 400 SP |
| “Wallet connect … message-signature login” | Met: EIP-6963, browser fallback, cryptographic signature verification, cancellation/retry, account switching; no transaction/approval/switch method in the tested request trace |
| “clean, playful … full English, mobile responsive” | Met: original hamster SVG, one type family, readable measured colors, main action on the 390px first screen, reflow checks |
| Live state, RPM, speed, work, settlements, countdown | Met: real API screenshot; running fixture additionally verifies 12.5 RPM, 79 mm/s and 23 current work; cumulative work shown separately |
| `dist/index.html`, assets, source, lockfile | Met: complete relative Vite export, local runtime assets, manifest and npm lockfile included |
| Production build, typecheck, useful validation | Met: successful commands and results below |
| Pinned six-domain Better Interface review | Met: applied while building; source/rendered coverage and fixed findings below |
| Title, favicon, description, `og:title`, `og:image` | Met: pinned share check passed; real 1,200×630 local PNG social card |
| Root `DESIGN.md` and rebuild README | Met: documents final values, components, responsive rules, commands and actual limitations |

No feature is represented as a shared global service. Hosting and publication are subsequent platform actions and were not performed here.

## Commands and actual results

Dependencies were installed in a separate temporary directory because repository dependency directories were excluded by the assignment. Build configuration accepts the optional `SQUEEK_DEPENDENCIES` directory; ordinary `npm ci` does not need that variable. The external TypeScript check used a temporary config extending the delivered `tsconfig.json`, with only dependency-resolution paths/type roots changed. Compiler strictness, source inclusion, and no-emit settings were preserved.

The final source was also copied to a clean temporary directory under the installed dependency tree, with no custom resolver or `SQUEEK_DEPENDENCIES` setting. Ordinary `npm run typecheck`, `npm test`, `npm run build`, and `npm run test:browser` all completed successfully there. This additionally checked the documented commands and normal public package imports; it found and corrected a test-helper import that had worked only with the external dependency path.

| Executed check | Result |
| --- | --- |
| Vite 8.3.5 production build (`vite build`, external toolchain) | Exit 0; HTML, CSS and three JavaScript chunks plus public assets produced |
| TypeScript 5.9.3 (`tsc --noEmit -p test/scratch/tsconfig.json`) | Exit 0 |
| `tsx --test tests/game.test.ts` | Exit 0; **23 passed**, 0 failed |
| `node tests/browser.mjs` | Exit 0; **10 scenarios passed**, 0 failed; Chromium and WebKit |
| Pinned `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | Exit 0; **16/16 passed** |
| Additional direct Playwright audit of real export under `/preview/` | No script errors or failed requests; live API, loaded local font, responsive screenshots, actual contrast sampling, mobile wallet list, 200% text size and RTL mirror inspected |
| API requests to `/v1/status` and `/v1/settlements?range=24h` | HTTP 200, real data and browser-accessible CORS responses observed |

Browser tests use controlled synthetic API records and freshly generated in-memory signing accounts **only in the test harness**. The real API checks and live screenshots use the external endpoints directly. Browser clocks advance immediately through round boundaries and the refund deadline; no real round-length waits were used.

The ten scenario groups cover:

1. Stake validation, next-round selection, reservation, duplicate prevention, reload persistence, exact result, streak payout, filtered history, CSV download and leaderboard.
2. API-down missing-data refund and disabled new picks.
3. Relief threshold and claim gating, plus player name editing.
4. EIP-6963 identity, signed message verification, account change, second signature, duel matching and pot settlement.
5. Rejected signature recovery and retry.
6. Keyboard opening, dialog Tab cycle, Escape, focus return, and empty-history recovery.
7. Reflow at 320/390/740/900/1440, 200% text sizing, axe scan, running metrics, active wheel animation and reduced-motion suppression.
8. Initial API failure, honest paused state and successful retry.
9. WebKit mobile prediction, reserved balance and wallet sheet dismissal.
10. Confirmed history still paying a winning pick when only the status endpoint fails; new picks stay paused.

The pinned probe passes render, layout, targets, contrast, casing, tracking, eyebrows, type sizes, type faces, glyphs, slogans, repetition, first-screen copy budget, chrome, motion and share metadata. At 390px it measured five type sizes, one typeface, three weights, and 20 first-screen prose words. All measured text passed 4.5:1 (3:1 for large text); no overflow, overlapping text, covered content, or clipped text was found. All 22 measured controls meet the 24px-or-spacing rule; 14 secondary targets remain below the 44px comfortable size. The main prediction button is 48px high, and phone wallet rows are 52px high.

The axe scan returned **zero violations** in the inspected main state for the selected WCAG A/AA tags. This is not a statement of full accessibility compliance.

The build emits a browser-externalization warning for an unused `node:worker_threads` module in the Ox dependency. React’s irrelevant client directives are filtered by the Vite warning handler. No corresponding script error occurred in either tested browser. No dependency code or registry archive was vendored.

## Six-domain Better Interface review

Read and applied the pinned workflow and core principles for accessibility, layout, writing, typography, colors and UI before and during implementation, followed by the implementation-documentation section. The review used both source checks and the rendered production export.

| Domain | Coverage | Evidence and limits |
| --- | --- | --- |
| Accessibility | Checked | Native buttons, links, fieldset/radios, labels, named icon controls, native dialog, focus outline, keyboard trapping/return, live error/status regions and reduced motion. Chromium keyboard scenarios and axe passed. Physical screen readers and voice control **not verified**. |
| Layout | Checked | Desktop and mobile production screenshots, main action at 390×844, reflow at 320/390/740/900/1440, 200% CSS text enlargement and RTL mirror. Native browser zoom and physical device keyboard/safe-area behavior **not verified**. |
| Writing | Checked | Consistent bands/rounds/stakes, explicit stake-inclusive return, action-first labels, empty-state actions, nearby validation, paused/retry messages, local-league disclosure. No localization beyond English. |
| Typography | Checked | Local variable font actually loaded; 12/14/16/20/28/40px declared scale; 400/600/800 weights; stable numerical counters; real wrapping/screenshots and long stake guard. Complete wallet address reachable in dialog. |
| Colors | Checked | Semantic aliases and deliberate category/status colors; real computed foreground/background pairs sampled; pinned contrast check passed. No alternate theme exists; forced-colors CSS was source-reviewed, not a Windows high-contrast session. |
| UI | Checked | Flat surfaces, single accent-filled action per task, selected/check states, hover/active/focus/disabled, empty/loading/pending/success/failure/retry flows. Running motion tested with and without reduced motion. Animations-panel replay at 10% speed **not performed**. |

No theme toggle, localization selector, video, audio, or transaction UI was required or added to satisfy a checklist.

## Findings, fixes and rechecks

All source references below point to the final source, where the correction now lives.

| Severity / domain | Source and original finding | Correction and recheck |
| --- | --- | --- |
| High / UI, identity | `src/components/Wallet.tsx:80` (`authenticate`): selecting the already-connected provider after an account change attempted another connector connection and left the login sheet open. | Reuse the active connector and request a fresh signature for the current address. The complete two-wallet duel and rejected-signature retry scenarios pass. |
| High / accessibility | `src/components/Modal.tsx:17`: the native dialog’s keyboard cycle could reach a non-dialog focus stop in the browser walk. | Added an explicit first/last Tab boundary while retaining native `dialog` semantics, inert background, Escape, and trigger restoration. Twelve consecutive Tabs and Escape-return assertions pass. |
| High / layout | `src/style.css:1789` (740px media rule): the enlarged-text header reached approximately 486px in a 390px viewport. | Allow header wrapping with vertical padding. Rechecked at 200% CSS text size: document width **390px**, zero offending boxes. Normal mobile main action remains at y≈679px. |
| High / data integrity | `src/lib/api.ts:188` and `:239`: basing every refresh’s clock offset on a cached generation timestamp could rewind the countdown or keep a stale feed eligible. | Official anchor defines rounds; device UTC advances them. A fresh-generation bound and measurement-age check gate new picks. Cached/stale response unit assertions and final browser suite pass. |
| Medium / writing, UI | `src/App.tsx:742`: same-band or unsigned duel-join errors were reported below the live panel, too far from the join control on phones. | Added a polite inline duel error beside open challenges; selection clears it, and join failures use that local region. Source rechecked; ordinary join succeeds in the production browser scenario. |
| Medium / validation | `src/App.tsx:134` and `:645`: an out-of-range typed stake was used in the displayed payout calculation before submission validation. | Only a valid 10–500 whole-SP stake produces a numeric return. Invalid stake submission focuses the field and announces the bound. Final build/typecheck and invalid-stake browser interaction pass. |
| Medium / accessibility | `src/App.tsx:426` (relief control): its visible label is hidden at narrow widths, leaving an icon without a name. | Added persistent `aria-label="Daily relief"`. Mobile role-based relief test and axe scan pass. |
| High / settlement correctness | `src/lib/game.ts:232`: waiting on one player’s earlier missing result could stop settlement for unrelated players. | Track unresolved earlier solo picks per player; other players and duels continue. Dedicated ordering unit test passes. |
| High / recovery | `src/lib/api.ts:267` and `src/lib/hooks.ts:29`: a status endpoint failure discarded otherwise available settlement history, delaying valid payouts. | Normalize a history-only response with unknown telemetry and paused new picks; keep prior trusted metrics labeled paused. Exact results still settle pending entries. A dedicated unit test and full browser outage/settlement scenario pass. |

The visual review retained the selected palette, original hamster scene, and flat layout. No unresolved high-impact finding remained in the inspected scope. Compact secondary target sizes are a documented comfort limitation, rather than a failed WCAG spacing check.

## Rendered evidence

- [390×844 first screen](images/mobile-first-screen.png): actual API, product and primary action visible.
- [Desktop production export](images/desktop-live.png): actual API, complete page and local-league disclosure.
- [Phone wallet sheet](images/mobile-wallet-sheet.png): app-opening links, vendor marks, Coinbase Smart Wallet and 52px rows. Links were inspected; actual app handoffs were not performed.
- [Keyboard-selected band](images/keyboard-focus.png): visible focus around the native radio label.
- [Machine-readable worker results](validation-results.json): probe/scenario outcomes and sampled contrast values.

Screenshots under `test/scratch/` are temporary and intentionally not part of the build. The evidence linked above is retained under `docs/images/`. Documentation and licenses use `docs/` because this repository excludes `artifacts/` from its Git bundle; no ignore rule was changed.

## Remaining limitations and completion

Submission integrity was rechecked for the revision: **862,523 bytes** in `dist/`, approximately **1.65 MiB** for the full 54-file delivery including source, lockfile, runtime assets, documentation, and retained screenshots. This is below the 8 MiB ceiling. Public assets match the export byte for byte, relative HTML asset references resolve, and a normal npm rebuild is byte-identical to the submitted export. No dependency/cache directories, dependency archives, ignore-rule changes, or submodules were added.

- Local league only: no global score service, remote matchmaking, cross-device pot escrow, or server enforcement of balances. Local points are editable by the browser owner, and clearing site storage resets them. This boundary is visible in the product.
- A static closed page cannot perform a timed settlement or refund until it is opened again. The next visit catches up, and completed refunds are final.
- The status timestamp and the device UTC clock must be reasonably aligned. API outages or future schema changes can pause new predictions and ultimately refund unavailable results.
- The supplied MCP browser tool could not launch its missing Chrome binary. Equivalent rendered checks used direct Playwright Chromium and WebKit. WebKit’s missing multimedia/runtime libraries were supplied only in a temporary external directory; its conservative host dependency validation was bypassed after a successful launch/render check. The actual WebKit primary interaction passed.
- Real extension popups, phone app handoffs, Coinbase passkey onboarding and smart-contract signatures against a real account were not exercised. Contract-wallet verification uses Mainnet; EOA verification is local and network-independent. No user keys, funds, or transactions were used.
- No physical screen-reader, voice-control, native zoom, physical mobile keyboard, or Windows high-contrast session was run. Do not interpret the automated scan or narrow viewport as those checks.

**Complete for the stated static local-league scope.** Required source, lockfile, production export, design documentation, installation instructions, actual worker checks and limitations are delivered. Global multiplayer would require an additional trusted service; this build does not imply one exists.

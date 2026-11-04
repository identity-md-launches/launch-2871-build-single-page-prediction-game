# Squeek Alert Lab

**Bring your own Telegram bot to the Squeekchain hamster wheel.** Configure the bot you own, choose the moments you care about, and send alerts directly from your browser. No backend, account, signup, wallet, or shared broadcast bot.

The complete static export is in **[`dist/`](dist/)**. It includes the local font, hamster artwork, favicon and social image. Serve its contents over HTTP/HTTPS; relative asset URLs also work at a gateway subpath. Opening the HTML with `file://` is unsupported.

## Install, preview and rebuild

Use Node.js **22.12+ or 24+** and npm:

```sh
npm ci
npm run dev
```

For the production export:

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

Open the address Vite prints. `vite.config.ts` uses `base: './'`. This is one page with anchor navigation; no route rewrites or server runtime are required. The existing project manifest and lockfile are retained unchanged, including their legacy package name and unused wallet dependencies. The delivered app imports no wallet infrastructure.

To run production interaction checks:

```sh
npx playwright install --with-deps chromium webkit
npm run test:browser
```

The browser suite manages a temporary server under `/preview/` and closes it afterwards. Tests intercept Telegram and Squeekchain requests, use synthetic credentials only in tests, and accelerate the browser clock. They never message a real chat. Reports and screenshots go to `test/scratch/`, which is disposable.

The editable social image is `src/assets/share.svg`. To regenerate the bundled 1200 × 630 PNG after editing it, run `node tests/share.mjs`, then rebuild.

## Use your bot

1. In Telegram, open [@BotFather](https://t.me/BotFather), send `/newbot`, and follow its prompts.
2. Send `/start` to your new bot. Paste its token into Alert Lab.
3. Enter your chat ID, or select **Find chat ID** to read recent messages to your own bot. If there is more than one chat, choose the recipient. A group ID includes a minus sign; add the bot to the group. A public channel can use its `@channel` name and must let the bot post.
4. Select **Send test alert**, check Telegram, choose your triggers, and select **Start watching**.
5. Keep the page open. Use **Stop watching** to stop sending or edit the recipient. **Forget saved bot** asks for confirmation, stops watching, and removes saved credentials and preferences.

Chat lookup reads `getUpdates` without an offset. It does not acknowledge updates, delete a webhook, or change allowed update types. If another reader or webhook prevents lookup, enter the chat ID manually. Recent updates may be absent even for a valid chat.

## Alert behavior

| Trigger                | What sends an alert                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Hamster wake-up        | An observed transition from 0 RPM to above 0                                                                     |
| Hamster sleep          | An observed moving → 0 transition followed by at least five minutes of consecutive zero readings; once per sleep |
| New round settled      | Newly seen, safe round confirmations from settlement history or mining checkpoints                               |
| RPM threshold crossing | Crossing upward to the target or downward below it; default **500 RPM**                                          |

All four toggles start enabled. The target accepts positive numbers up to 1,000,000 RPM. Editing it establishes a new comparison baseline rather than manufacturing a crossing. An invalid draft keeps the last valid target active and shows an error; it cannot start a new watching session.

Both official endpoints are polled every **15 seconds**, including when sending is stopped so the live panel remains useful:

- [Status](https://api.squeekchain.com/v1/status): `measurement.rpmMilli / 1000`, freshness and sensor timestamps, `coreStatus`, and `builder.queued.openRoundWorkUnits`. Current round work is **not** cumulative work.
- [24-hour settlements](https://api.squeekchain.com/v1/settlements?range=24h): safe settlement ranges and safe mining checkpoints. Checkpoints also reveal zero-work rounds omitted from recent active settlements. Overlapping proofs are deduplicated. A batched confirmation is named as a round range; its work is never assigned to individual rounds.

The first successful poll after starting establishes a baseline and sends no historical alerts. Starting while the hamster is already asleep does not count as a new sleep transition. Reloading keeps settings but **never automatically resumes sending**. State transitions and the latest 100 log entries live only in this page session.

A failed or stale status request resets the wheel comparison baseline; a gap longer than 45 seconds does too. Sleep is never inferred across a missing observation gap. Round history remains independently useful during a status outage, and can catch up from the records the API still returns after a temporary history outage. There is no guarantee of a complete backlog. Feed timestamps more than two minutes away from the device clock are rejected; check the device clock if that warning appears. Missing metrics display a dash rather than a fabricated zero.

Messages are sent sequentially with a 12-second timeout. The log distinguishes **Sending**, **Sent to Telegram** and **Failed**. “Sent” means Telegram accepted the request, not that the recipient read it. Failed deliveries offer manual retry; ambiguous network failures explain that retry may duplicate a message. Rate limits impose Telegram's retry delay. There are no silent retries. Stopping cancels queued sends; an already accepted request cannot be recalled.

## Privacy and open-page limit

The token and settings are stored only in this browser's localStorage, under `squeek-alert-lab:settings:v1`. Storage failure is shown; the app can continue in memory for the visit. There are no analytics, external scripts, external fonts, application servers, or credential uploads to Squeekchain.

**Sending an alert necessarily transmits the token directly to Telegram**, as required by its [Bot API](https://core.telegram.org/bots/api#sendmessage). The application does not send it to an intermediary or put it in alert text, logs, links, or displayed server errors. Chat discovery also communicates directly with Telegram. Local storage is origin-specific; settings do not sync between devices.

**Alerts only fire while the page is open.** Background tabs may be throttled and a sleeping device may suspend polling. There is no background worker or closed-page delivery. Use one watching tab: Web Locks prevent concurrent watchers on the same origin where supported; browsers without that API require keeping one watching tab yourself.

## Validation

Worker validation on **2026-11-04**:

| Check                            | Result                                                                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Production build                 | Passed; complete, relative export in `dist/`                                                                                  |
| TypeScript                       | Passed with `tsc --noEmit`                                                                                                    |
| API and alert unit tests         | 19/19 passed                                                                                                                  |
| Chromium and WebKit interactions | 21/21 scenarios passed                                                                                                        |
| Pinned taste@1                   | 16/16 passed at 320, 390 and 1440 px                                                                                          |
| Accessibility                    | No Axe violations in the inspected default state in either engine                                                             |
| Reflow                           | No horizontal overflow at 320, 390, 560, 740, 800, 900, 1120 or 1440 px; 200% text enlargement and an RTL mirror also checked |
| Live API smoke check             | Both endpoints returned HTTP 200 in the actual production page; no console errors                                             |

The ordinary `npm run typecheck`, `npm test`, and `npm run build` commands also passed in a clean source copy using dependencies installed outside the repository. No repository dependency directory, build configuration, manifest or lockfile was changed. The clean build produced the same asset names and sizes as the delivered export. WebKit required temporary external runtime libraries and software rendering; none is bundled.

Real bot credentials were not supplied, so actual Telegram chat delivery, physical phones, screen-reader sessions, browser-native zoom, forced-colors rendering and live five-minute hardware transitions were **not verified**. API failure, sleep timing and Telegram success/error paths were tested with intercepted requests and a controlled clock. These are worker observations, not independent certification.

Detailed six-domain design coverage, fixes, commands, screenshots, actual check results and remaining limits are in [`artifacts/validation.md`](artifacts/validation.md). The implemented design is documented in [`DESIGN.md`](DESIGN.md).

## Source map

| Path                     | Purpose                                                                        |
| ------------------------ | ------------------------------------------------------------------------------ |
| `src/App.tsx`            | Setup, chat lookup, triggers, live panel, log and instructions                 |
| `src/lib/api.ts`         | Official API parsing, freshness and safe confirmations                         |
| `src/lib/alerts.ts`      | Pure wheel and round transition detection                                      |
| `src/lib/useLab.ts`      | Polling, watching lock, sequential delivery and session log                    |
| `src/lib/telegram.ts`    | Direct Telegram sending and chat lookup; sanitized failures                    |
| `src/lib/settings.ts`    | Browser settings and validation                                                |
| `src/components/Art.tsx` | Retained hamster identity, adapted dark wheel and SVG icons                    |
| `src/style.css`          | Tokens, responsive layout and interaction states                               |
| `tests/`                 | Unit tests, production browser suite, preview harness and share-image renderer |
| `public/`, `dist/`       | Required local assets and complete production export                           |

See [third-party notices](docs/THIRD_PARTY_NOTICES.md) for font and design-guidance licenses.

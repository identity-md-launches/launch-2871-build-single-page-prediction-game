# Squeek Alert Lab design system

## Overview

A personal Telegram alert toolkit for people following the Squeekchain hamster. The interface leads with owning and configuring your own bot, rather than joining somebody else's broadcast. Its visual idea is a small night-time lab: dark instrument panels, a warm amber primary action, and the existing Squeek hamster in a muted green wheel.

The setup is the product, with no separate marketing hero. On a wide screen, setup and triggers share an edge in the main column; the live wheel and open-page guidance sit alongside them. The log follows both. English and one dark theme are intentional. Existing hamster artwork and the local Nunito Sans font are carried forward; wallet and prediction-game UI are removed from this app.

## Colors

The canonical hexadecimal sRGB primitives and semantic aliases are in `src/style.css:10`. Components use the semantic roles below; artwork has its own illustrative colors in `src/components/Art.tsx` and `src/assets/share.svg`.

| Semantic token                            | Primitive / value                                  | Job                                             |
| ----------------------------------------- | -------------------------------------------------- | ----------------------------------------------- |
| `--color-bg`                              | `--slate-950`, `#121719`                           | Page and input backgrounds                      |
| `--color-surface`                         | `--slate-900`, `#1b2225`                           | Main panels                                     |
| `--color-control`                         | `--slate-850`, `#222a2d`                           | Neutral buttons, logo backing, empty-state icon |
| `--color-border`                          | `--slate-800`, `#2c363a`                           | Panel outlines and separators                   |
| `--color-control-border`                  | `--slate-700`, `#526167`                           | Input/button outlines and disabled toggle track |
| `--color-text`                            | `--slate-100`, `#eff2ed`                           | Headings, values, body and labels               |
| `--color-muted`                           | `--slate-400`, `#a6b2b6`                           | Hints, supporting copy, timestamps              |
| `--color-accent`                          | `--amber-300`, `#f5c276`                           | Start/stop action and enabled toggles           |
| `--color-accent-hover`, `--color-focus`   | `--amber-200`, `#ffcf8c`                           | Action hover and keyboard outline               |
| `--color-on-accent`                       | `--amber-950`, `#2b2115`                           | Text/icons on amber                             |
| `--color-positive`, `--color-positive-bg` | `--green-300`, `#9bceae`; `--green-950`, `#213b2d` | Fresh/active status and delivered alert icons   |
| `--color-sleep`                           | `--lilac-300`, `#b8b2dd`                           | Sleep trigger illustration                      |
| `--color-error`, `--color-error-bg`       | `--red-300`, `#ffb4ac`; `--red-950`, `#442925`     | Field/feed failures and failed alert icons      |

Only one filled action competes for attention in the setup form. Neutral buttons are outlined. Status always has text as well as color; log icons also change shape. The pinned rendered probe passed text contrast in its inspected states. Sample rendered pairs and measured ratios are recorded in `artifacts/rendered-metrics.json`; there is no claim of a light-theme audit.

## Typography

One local variable **Nunito Sans** font, `public/fonts/nunito-sans-latin.woff2`, is declared for weights 400–800; the interface uses **400, 600 and 800**. Fallbacks are `ui-rounded, system-ui, sans-serif`. The font's OFL license ships beside it. It is preloaded in `index.html`; no font service is contacted.

| Token            | Size at a 16px root | Use                                   |
| ---------------- | ------------------- | ------------------------------------- |
| `--text-xs`      | .75rem / 12px       | Hints, status labels, log metadata    |
| `--text-sm`      | .875rem / 14px      | Compact copy, buttons, trigger labels |
| `--text-base`    | 1rem / 16px         | Inputs, body, mobile section titles   |
| `--text-lg`      | 1.25rem / 20px      | Desktop panel titles and wheel state  |
| `--text-xl`      | 1.75rem / 28px      | Mobile H1 and metric values           |
| `--text-display` | 2.5rem / 40px       | Desktop H1                            |

Body line height is 1.5; supporting notes use 1.6–1.7, H1 uses 1.15, H2 1.3 and H3 1.4. The H1 has −.04em tracking, H2 −.02em, and regular copy natural tracking. Headings balance wrapping, prose uses pretty wrapping and a 70ch maximum. Changing numbers use tabular numerals. Inputs stay 16px on phones to avoid iOS input zoom. IDs and messages wrap; critical content is not ellipsized. Natural casing is used throughout; RPM is a unit, not a section kicker.

## Layout

`src/style.css:185` defines the shared `.header-inner`, `.page-container` and `.site-footer` edges: **1264px maximum border-box width**, auto inline margins and 32px desktop insets. The effective maximum content width is 1200px. Spacing tokens are 4, 8, 12, 16, 24, 32 and 48px; matching literals are also used. Panel padding is 28px on desktop, 24px at the intermediate width and 20px on phones (16px below 360px).

`.workspace` uses `minmax(0,1.58fr) / minmax(0,1fr)` with a 24px gap. Setup and triggers stack in `.configure-column`; `.observe-column` contains the wheel and open-page note. Form fields share a row when space allows. The alert log spans the main width. The explanatory steps are below the working product.

| Breakpoint         | Implemented adaptation                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| At or below 1120px | Panel padding tightens; setup fields stack; workspace becomes 1.3fr / 1fr; the secondary intro note hides                                                                                              |
| At or below 800px  | Workspace becomes one column; page insets become 24px; setup fields share a row again; live panel and its note can share a row; H1 becomes 28px; instructions move below their introduction            |
| At or below 560px  | 16px page insets; fields stack; live panel/note stack; compact header hides the help anchor; panel titles become 16px; log toolbar and entry metadata wrap; instructions become vertical numbered rows |
| Below 360px        | 12px page insets; 16px panel padding; brand text can stack; action buttons stack with Start watching first                                                                                             |

There is no sticky chrome or fixed bottom action to obscure content. Text containers grow naturally. Main actions remain in normal flow and inset from the screen edge. The first 390×844 screen includes the product, inputs, both setup actions, privacy note and the open-page reminder. Browser reflow was checked at 320, 390, 560, 740, 800, 900, 1120 and 1440px, plus 200% CSS text enlargement and an RTL mirror. These are not native zoom or localization tests.

## Elevation & depth

The interface is deliberately flat: one surface tone and structural 1px borders, no panel shadows, nested cards, backdrop effects or gradients. The wheel has its own dark SVG enclosure, muted spokes and a ground ellipse. Panel separation comes from spacing and tone. No dialogs or elevated overlays are implemented.

## Shapes

`--radius-sm` is 8px for buttons/inputs, `--radius-md` 12px for phone panels, and `--radius-lg` 20px for desktop panels. Status dots, step counters, empty-state markers and log icons are circular. Toggle tracks are 40×24px with a 16px thumb. The native switch input has a 44px hit box, and its surrounding label is also clickable. Main buttons and bot/chat inputs are at least 48px high. Compact utilities and inline links use the guide's target-spacing exception; the probe reports nine controls below the comfortable 44px size, without a target-spacing failure.

## Components

| Component / source                                      | Use and states                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Setup form, `src/App.tsx`                               | Visible labels, masked/revealable token, chat ID entry/lookup, inline submit validation, focus on first invalid field, explicit test and start/stop actions. Bot/chat inputs lock while watching, finding chats or sending a test. Forgetting requires a local inline confirmation. Lookup feedback wraps even unbroken long chat names.            |
| Buttons, `src/style.css`                                | `.button.primary` for watching; `.button.secondary` for the test and chat choices; `.icon-button` for refresh; `.text-button` / `.inline-action` for small utilities. Pending controls use native disabled; every action has visible focus and pressed/hover states.                                                                                |
| Trigger row, `src/App.tsx`                              | `.trigger-label` wraps a native checkbox with `role="switch"`, title, description and artwork. Space toggles it; a static thumb and color show state. The labeled numeric target disables with its trigger and retains the last valid value if an invalid draft is entered.                                                                         |
| Live panel, `src/App.tsx`                               | Official running/sleeping state, RPM, current round work, latest safely settled round and polling countdown. Loading, stale and failure states show uncertainty and recovery instructions. Missing measurements use a dash. Refresh is disabled while a poll is outstanding.                                                                        |
| `Hamster`, `WheelArt`, `Icon`, `src/components/Art.tsx` | Original hamster identity retained with sleepy/active variants; wheel recolored for the dark theme; one `currentColor` outline icon set. Decorative SVG is hidden from assistive technology because adjacent text carries the meaning. Wheel state has a static label; the wheel is not continuously animated.                                      |
| Alert log, `src/App.tsx`                                | Session-only list, timestamps, delivery states, sent count, native filter, clear action, message disclosure via native details/summary, and manual retry. Failed network delivery explains ambiguity; rate limits disable retry until its deadline. Clear retains entries still being sent. Empty/filter-empty states explain how to fill the list. |
| Notices, `src/App.tsx`                                  | Stable status/alert regions, field-specific error associations, storage failure feedback, persistent open-page reminder and direct-to-Telegram privacy copy.                                                                                                                                                                                        |
| Shared page, `src/main.tsx`                             | Error boundary offers Reload toolkit; a skip link reaches bot setup. One H1, sequential headings and semantic header/main/aside/footer landmarks.                                                                                                                                                                                                   |

The 2px amber `:focus-visible` outline has a 4px offset, or 2px on fields. Toggle focus draws around its visible track rather than the transparent native input. Forced-colors overrides preserve a system-color outline and toggle border. Hover styling is gated to a hover-capable pointer. Under `prefers-reduced-motion: no-preference`, explicit color/border/transform transitions last 120ms; button press scale is .96 with `cubic-bezier(.2,0,0,1)`. There are no entrance animations, endless rotations or motion-only cues. Reduced motion disables those transitions.

`index.html` supplies title, description, favicon, OG title/description/image and a large-image Twitter card. `public/share.png` is rendered from the editable `src/assets/share.svg` by `tests/share.mjs`.

## Do's and don'ts

- Reuse the shared container, panel spacing, type scale and semantic tokens. Add new settings as native labeled controls with adjacent help and a clear enabled state.
- Keep one filled primary action. Use the neutral secondary style for tests, retries and utilities.
- Keep ownership, direct-to-Telegram delivery and the open-page requirement clear beside the setup.
- Keep uncertain data visibly uncertain. Do not animate or fabricate a live state when the API is missing or stale.
- Keep bot tokens masked and out of displayed messages, screenshots, logs and external links.
- Preserve the flat surfaces, restrained motion and existing hamster identity. Do not add wallets, a competing hero, external fonts or another type scale.
- For another section on this page, start with `.panel`, reuse the H2/field/button patterns and place it in normal flow. Verify its 320px reflow and keyboard path before adding new layout rules.

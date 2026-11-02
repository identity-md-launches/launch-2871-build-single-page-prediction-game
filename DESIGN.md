# Squeek Streak design system

## Overview

Squeek Streak is a compact prediction game for the Squeekchain hamster wheel. Its visual idea is a small, illustrated hamster economy: warm seed-orange actions, forest-green text, a pale green wheel enclosure, and simple cream surfaces. The play form is the product, with no separate marketing hero.

The page uses consistent edges, generous space between groups, compact data labels, and one orange primary action. The hamster SVG is original artwork implemented in `src/components/Art.tsx`; its sleepy and active variants identify the four work bands. The page is English-only with one light theme.

## Colors

Canonical tokens are in `src/style.css`, using hexadecimal sRGB primitives and semantic aliases. No dark-theme token block is implemented.

| Semantic role | Token / source value | Use |
| --- | --- | --- |
| Page background | `--color-bg` → `--cream-100: #f7f8f2` | Whole page |
| Surface | `--color-surface` → `--cream-50: #fcfcf9` | Form, league, account strip, dialogs |
| Neutral inset/hover | `--cream-200: #edf0e5` | Presets, soft control states, neutral badges |
| Structure | `--color-border` → `--cream-300: #dce1d4` | Inputs, separators, neutral buttons |
| Primary text | `--color-text` → `--forest-950: #263c30` | Headings, data, body |
| Secondary text | `--color-muted` → `--forest-600: #63715f` | Captions and hints |
| Strong secondary text | `--forest-700: #52624f` | Wheel labels and quiet controls |
| Wheel/background accent | `--forest-200: #e8eedf` | Live wheel surface, avatars, streak highlights |
| Primary action | `--color-accent` → `--orange-600: #bc461f` | Lock prediction, selected pick border, active tab underline |
| Action hover | `--color-accent-hover` → `--orange-700: #aa3c19` | Hover on filled actions |
| Selected/pending background | `--orange-100: #fae9dd` | Selected band, pending result, notifications |
| Success | `--color-success` → `--green-700: #34603c` | Wins, profit, live state; `--green-100: #e9f1e3` backgrounds |
| Loss/error | `--color-danger` → `--red-700: #a43c33` | Inline errors and negative profit |
| Sleep category | `--violet-700: #6c4c83`, `--violet-100: #efe8f5` | Confirmed Sleep badges |
| Focus | `--color-focus: #315c39` | 2px focus outline, 4px offset |

The Stroll history category uses `#6d5a27` on `#f2eddc`. The sleeping state uses `#52624f` on `#dce5d4`; the active state uses `#34603c` on `#d6e5ca`. Illustration-only greens, orange fur, and pink ears are contained in `Art.tsx` and do not replace functional text tokens.

Measured rendered text pairs: primary button white on orange **5.21:1**; heading on page **11.10:1**; secondary text on page **4.85:1**; selected-band text **10.03:1**; sleeping status **5.03:1**; live label **6.15:1**; Sleep result badge **5.85:1**. These are sampled pairs, with the pinned probe additionally checking all measured visible text in its inspected states. Text, icons, and selected indicators carry meaning alongside color.

## Typography

One locally bundled variable **Nunito Sans** face, `public/fonts/nunito-sans-latin.woff2`, covers weights 400–800. The interface uses **400, 600, and 800**. The browser confirmed the intended font loaded; no external font request is needed. Fallbacks are `ui-rounded, system-ui, sans-serif`. The OFL license is beside the font.

The six declared sizes are `--text-xs: .75rem`, `--text-sm: .875rem`, `--text-base: 1rem`, `--text-lg: 1.25rem`, `--text-xl: 1.75rem`, and `--text-display: 2.5rem` (12, 14, 16, 20, 28, 40 px at the default root size). Captions are 12px; controls and compact prose are 14px; normal text and mobile inputs are 16px; section titles are 16–20px; the page title is 40px on desktop, 28px on phones, and 20px below 360px.

Body line-height is 1.5. Headings use 1.2, with 1.3 in dialog titles and counters; longer rule text uses 1.6. H1 tracking is −.045em at display size, −.04em at 28px, and −.025em at the smallest width. Section heading tracking is −.02em. Headings balance wrapping and prose uses `text-wrap: pretty`. Changing numbers use tabular numerals. There is no monospace prose or uppercase kicker label. Critical amounts and full wallet addresses remain reachable and selectable; the wallet dialog wraps the complete address.

## Layout

`src/style.css` defines `.page-container` and `.header-inner` with a 1,240px maximum border-box width and 32px desktop side padding. The main content’s effective desktop width is 1,176px. The page spacing vocabulary is 4, 8, 12, 16, 24, 32, and 48px (`--space-1` through `--space-7`); declarations also use matching literal values and a few optical adjustments.

The desktop game grid is `.88fr / 1.12fr` with a 24px gap: live wheel first, prediction form second. The insights row reverses the emphasis to `1.12fr / .88fr`. History/leaderboard spans the container. The account strip sits immediately above the game. This is a single page, with anchored navigation and stateful views.

| Breakpoint | Implemented adaptation |
| --- | --- |
| Above 1,500px | Main top padding grows to 48px |
| 1,100px and below | Tighter header and surface padding, quieter secondary typography |
| 900px and below | 24px page inset, compact desktop grid, best-streak stat hidden |
| 740px and below | Header navigation collapses; header can wrap for enlarged text; game becomes one column with the prediction form first; insights stack; account strip retains name/balance/relief; history shows stake inside the pick cell; its filter row occupies the available width and CSV sits below |
| 440px and below | 16px page inset, 28px H1, compact four-across bands, bottom-aligned wallet dialog, stacked history toolbar |
| 360px and below | 20px H1, smaller brand/spacing, simplified table icons, footer stacks |

Text containers grow naturally. Dialogs have a viewport-relative maximum height and their own scrolling; backgrounds do not scroll while a dialog is open. Buttons stay inset from screen edges. The page has no fixed bottom action bar. At 390×844, the main prediction action is visible in the first screen; its top is approximately 679px and height 48px. Reflow was checked at 320, 390, 740, 900, and 1440px. CSS text enlargement to 200% at 390px and an RTL mirror were also checked; browser-native zoom and full RTL localization were not.

The mobile `.history-filters` uses `flex: 1 1 100%` and `min-width: 0`; `.select-label:first-child` also has `min-width: 0`, allowing the player selector to shrink beside Result. A 24-character player name was checked at 320, 390, 440, 740, and 1440px. At 320px, both selectors fit the 264px toolbar and the document remains 320px wide. Full names remain available in the native option list and profile editor.

## Elevation & depth

Main surfaces are flat, separated by spacing and tone. Structural borders appear on inputs, selected bands, neutral buttons, and data separators; surfaces do not combine borders and shadows. Dialogs alone use `0 20px 80px #1d2f2833`, with a `#172c2680` backdrop and 3px backdrop blur. The native top layer provides dialog stacking and inert background behavior.

## Shapes

The shared radius tokens are 8px for controls (`--radius-sm`), 12px for groups (`--radius-md`), 20px for main surfaces/dialogs (`--radius-lg`), and 100px for status pills. Mobile main surfaces use 16px; mobile bands use 9px. Circular avatars and streak steps are explicit exceptions. Band borders carry selection; text is not clipped to preserve rounded corners.

## Components

| Component / pattern | Source and behavior |
| --- | --- |
| `Hamster`, `WheelArt`, `Icon` | `src/components/Art.tsx`; original decorative SVG variants, one `currentColor` outline icon set. Hamster mood matches a band; wheel rotation reflects a fresh running feed. SVG is hidden from assistive technology where adjacent text supplies meaning. |
| `BandPicker` | `src/App.tsx`; a native radio group inside a fieldset. Four labeled choices, selected dot/check and border, visible keyboard focus on the label, native arrow-key behavior. |
| Stake + payout | `src/App.tsx`; labeled 16px input, 50/100/250 presets, inline validation, whole 10–500 SP limit, stake-inclusive payout preview. Invalid long input cannot expand the return display. |
| Buttons | `src/style.css`; `.button.primary` for the current action, `.secondary` and `.small-button` for peers, `.icon-button` for named utilities, `.text-button` for quiet help/export. Hover is gated to hover-capable pointers. Disabled, pressed, and focus states are defined. |
| Live panel | `src/App.tsx`; real state, three metrics, official round/count data, total work, source link, and explicit refresh/retry. Loading and stale states never substitute sample metrics. |
| `Modal` | `src/components/Modal.tsx`; native `dialog`, title association, close button, Escape/backdrop dismissal, explicit Tab boundary handling, background scroll lock, and trigger focus restoration. |
| `Wallet` | `src/components/Wallet.tsx`; one connect control with EIP-6963 names/marks, browser fallback, Coinbase, mobile open-in rows, signature pending/retry/rejection, verified identity, and disconnect. Wallet marks retain vendor colors. |
| Mode/activity tabs | `src/App.tsx`; native buttons with `aria-pressed`, active underline, and persistent visible names; these are button groups, not incomplete ARIA tab widgets. |
| History/leaderboard | `src/App.tsx`; consistent aligned rows, local-league disclosure, player/result filters, clear empty state, CSV export, result text plus color, and expandable history. |
| Relief/profile/rules | `src/App.tsx`; disclosed low-balance threshold/reset time, name editing, and exact game rules in the shared native dialog. |

High-frequency color/background transitions last 120ms with explicit properties. Press scaling is `.96` using `cubic-bezier(.2,0,0,1)`. Wheel motion is a 14-second linear rotation. All animation and press motion are inside `prefers-reduced-motion: no-preference`; running state also has a static text label. There are no staged page entrances, confetti, gradients, audio, or autoplay media.

`public/share.png` is the 1,200×630 social card referenced by `og:image`. Its wordmark uses the local `public/favicon.svg` hamster mark, embedded before capture; the production build copies the complete PNG to `dist/share.png`.

## Do’s and don’ts

- Reuse the page container, type scale, flat surfaces, and existing button styles for another section. Keep the main action visible before decorative explanation on phones.
- Use the accent fill for the active task. Use neutral controls for help, filters, and navigation. Category badges may use their established state colors.
- Preserve labels, the visible selection check, explicit data freshness, and local-league boundaries. Keep errors near the affected controls.
- Keep wallet icons as vendor marks, illustrations as SVG, and fonts local. Avoid introducing an unrelated icon set, font, or theme.
- Add a new section within the existing width/spacing system, choose an appropriate heading level, use the shared modal for an overlay, and check the real export at narrow widths, large text, and reduced motion.

The design and review applied the pinned Better Interface six-domain reference, adapted from Jakub Krehel’s Better Interface (MIT, commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`) and Paul Bakaus’s Impeccable documentation method (Apache-2.0, commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`). See `docs/licenses/design-guidance-LICENSE.txt` and the validation record for coverage and limitations.

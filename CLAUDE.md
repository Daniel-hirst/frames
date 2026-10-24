# Frames: snooker tracker for Dan and Damon

A tiny mobile-first web app for two people who play snooker about once a week. It records each night as a **session** of **frames**, then shows head-to-head record, win streaks, break records, averages and charts.

Dan is the only person who logs results. Damon opens the same link and sees everything read-only. No backend: the data is a JSON file in this GitHub repo, hosted on GitHub Pages.

The design is in `design/`. Read those images before building any screen:

| File | What it is |
|---|---|
| `design/1-session.png` | Session screen (log a night) |
| `design/2-stats.png` | Stats |
| `design/3-charts.png` | Charts |
| `design/4-history.png` | History |
| `design/5-settings.png` | Settings |
| `design/6-splash.png` | Static splash screen |
| `design/7-app-icon-1024.png` | App icon |
| `design/intro-reference.html` | The animated intro, already built in plain HTML/CSS/SVG. Lift it. |

Note: the PNGs were rendered without the Barlow fonts, so lettering is a fallback typeface and some text is a little wider than it will be. Use the fonts listed under Design tokens. All numbers in the images are made-up sample data.

## Stack

- Static site on GitHub Pages. No build step, no server.
- Plain HTML + JavaScript. Bootstrap 5 for layout and form controls, jQuery for DOM and events, Chart.js for charts. All from CDN.
- Bootstrap Icons for icons. For the settings button use the real `gear` icon (the mock's cog looks too much like a sun).
- Fonts from Google Fonts: Barlow (400, 500, 600) and Barlow Condensed (600, 700).
- Single page, hash routing: `#session`, `#stats`, `#charts`, `#history`, `#settings`.
- Installable to the home screen: `manifest.webmanifest`, icons from `design/7-app-icon-1024.png`, `apple-touch-icon`, `theme-color` `#0E2F25`, standalone display.

Suggested files: `index.html`, `app.js` (UI + routing), `stats.js` (pure functions, no DOM), `github.js` (load/save), `share.js` (share-a-night picture), `style.css`, `data.json`, `manifest.webmanifest`, `icons/`.

## Data model

One file, `data.json`, in the repo root. Only **confirmed** sessions are in it.

```json
{
  "players": [
    { "id": "dan", "name": "Dan" },
    { "id": "damon", "name": "Damon" }
  ],
  "sessions": [
    {
      "id": "2026-10-17",
      "date": "2026-10-17",
      "frames": [
        { "winner": "dan",   "score": { "dan": 72, "damon": 35 }, "breaks": { "dan": 34, "damon": 12 } },
        { "winner": "damon", "score": { "dan": 18, "damon": 64 }, "breaks": { "dan": 0,  "damon": 29 } }
      ]
    }
  ]
}
```

- `score` is each player's points total for the frame. Both are required when logging.
- `breaks` is each player's **best break in that frame**. `0` means no notable break. Maximum 147, and never more than that player's frame score.
- Every frame has exactly one winner. No draws. `winner` is the player with the higher `score`, set when the frame is added (level scores can't be added: a re-spotted black settles a tie). It is stored so stats don't depend on `score`.
- Frames logged before `score` existed have no `score` field; show them without one.
- Session `id` is the date; if a second session is logged on the same date use `2026-10-17-2`.
- Keep `sessions` sorted by date, then by creation order. Frame order inside a session is the order played.
- All stats are calculated from this file. Never store derived numbers.
- Start with an empty `sessions` array. Do not ship the sample numbers from the design.

## Two modes

- **Logger mode** (a GitHub token is saved on this device): Session tab and Settings cog are visible, everything is editable. Only Dan's phone.
- **Read-only mode** (no token): hide the Session tab. Stats, Charts and History work the same but have no Edit or Delete buttons. This is Damon's view. He needs no setup, he just opens the link.

The settings cog shows in both modes. A home-screen app has its own storage (no token carried over from Safari) and no address bar, so Settings must be reachable without a token. Damon seeing the cog is fine. `#settings` also works if typed in the URL.

Adding `?mode=readonly` to the URL shows the read-only view on a device that has a token, so Dan can check what Damon sees. There is no URL switch into logger mode: that needs the token.

## Screens

Mobile first, 390 px wide is the target. Bottom tab bar with four tabs: Session, Stats, Charts, History. Settings is the cog in the top right of every screen.

### Session (log a night)

1. Date button (defaults to today, tap to change, so an old night can be logged) and a "Draft saved" label.
2. Score card: Dan's frames, Damon's frames, big, on one line (`white-space: nowrap`).
3. "Frames so far" list: frame number, winner dot and name, the frame score (big, e.g. `72 – 35`) with the two best breaks small underneath.
4. "Add frame N" card: a frame score box for each player (the higher score wins; the leading box takes that player's colour), a best-break control for each player, "Add frame". Add frame stays disabled until both scores are in, they aren't level, and no break is above its player's score; a hint line says why.
   - Break control: minus and plus buttons plus the number itself is tappable to type (`inputmode="numeric"`, 0 to 147). Typing is the fast path for a break like 34.
   - After "Add frame": clear both scores, reset both breaks to 0, scroll the new frame into view.
   - Tap a frame in the list to edit or remove it.
5. "Confirm session (N frames)": the main button. Disabled with no frames. Confirming writes to GitHub (see below), clears the draft, goes to History.
6. "Discard draft": asks for confirmation.

Draft handling: the open session lives in `localStorage` key `frames.draft` after every change, so a closed tab or lost signal loses nothing. On load, if a draft exists, the Session tab shows it.

Only one draft at a time. Starting to edit a past session while a draft exists asks what to do with the draft.

### Stats

Toggle: All time / Last 10 sessions. Everything below recalculates for the chosen range.

- Head to head: frames won each (big), split bar, win % each, "N sessions · N frames".
- Streaks per player: current win streak and longest win streak.
- Breaks table: highest break, 30+ breaks, 20+ breaks, average best break per frame.
- Average frames per session.
- Totals card under head to head: frames won, points and points per frame each, then total frames played and total points scored (both players together).
- Records: per player, highest break, highest frame score, biggest frame win, best night, longest win streak, each with the date it was set. Tapping one opens that night in History.

### Charts

All three are Chart.js, styled to match (no gridline clutter, two series colours, rounded bars):

1. Best break trend (rolling average best break, last 5 sessions), both players. Line chart.
2. Running frames total (cumulative frames won over sessions), both players. Line chart.
3. Best break per session, last 8 sessions, grouped bars.

### History

Sessions newest first, grouped by month. Each row: date, best break each, final score (winner coloured, tied is fine). Tap to expand and show the frames, then the night's points (both players, only when the frames have scores). Expanded rows show the frames the same way as the Session list. Expanded view has **Edit session** (loads it into the Session tab as an editable draft, confirming replaces it by `id`) and **Delete** (confirm dialog, then commit). The "Session deleted" toast offers **Undo**, which commits `Restore session ...` (same id unless it was reused meanwhile).

**Share this night** (both modes): draws a 1080-wide PNG of the night in the app's style (`share.js`), with the night's points under the score, and opens the share sheet, or downloads it where there is no share sheet. The picture is drawn when the row is expanded, because iOS refuses `navigator.share` if too long passes after the tap.

### Settings

- Player names (the two names shown everywhere).
- GitHub saving: repository (`owner/repo`), access token (password field with Show button), status dot. Token and repo are stored in `localStorage` only (`frames.token`, `frames.repo`), never in the repo or the code.
- "Copy read-only link for Damon" (copies the plain site URL).
- "Download data.json backup".
- Save settings.

## Stats rules (put these in `stats.js` and unit test them)

Treat all frames in order: sort sessions by date, then frames in played order.

- **Frames won / win %**: count per player, win % = won / total frames.
- **Current streak**: number of consecutive frames at the end of the record won by that player. 0 if the other player won the last frame.
- **Longest streak**: the longest run of consecutive frames won by that player, across session boundaries.
- **Highest break**: maximum `breaks[player]` over all frames.
- **30+ / 20+ counts**: number of frames where that player's best break is at least 30 / at least 20. 20+ includes the 30+ ones. Only the best break per frame is recorded, so this counts frames, not individual breaks.
- **Average best break per frame**: mean of `breaks[player]` over all frames, including zeros. One decimal place.
- **Average frames per session**: total frames / sessions. One decimal place.
- **Session best break** (chart 3): max of `breaks[player]` across the session's frames.
- **Rolling average best break** (chart 1): for each session, a player's mean best break per frame in that session; the rolling value is the mean of those over the last 5 sessions up to and including this one (fewer at the start).
- **Cumulative frames won** (chart 2): running total per player after each session.
- **Points**: per player, sum of `score[player]` over frames that have a `score` (older frames without one are skipped); points per frame = total / scored frames, one decimal place.
- **Records**: highest break, highest frame score, biggest frame win (winning margin), best night (session won by the biggest frame margin, then most frames won), longest win streak (with the sessions it started and ended in). Each carries its session and date. A record equalled later stays with the first time it was set. `null` when there is none (no break, no frame won).
- **Last 10 sessions** filter: take the 10 most recent sessions and run every rule above on them only. Streaks inside the filtered range only.

## Saving to GitHub

Uses the GitHub Contents API with a fine-grained personal access token scoped to this one repository, "Contents: read and write" only. Dan creates it once and pastes it into Settings.

On Confirm session:

1. `GET https://api.github.com/repos/{repo}/contents/data.json` with `Authorization: Bearer {token}` to get the latest content and its `sha`.
2. Decode (base64, UTF-8), append or replace the session, re-sort.
3. `PUT` the same URL with `message`, base64 `content`, and the `sha` from step 1.
4. On 409 or 422 (the file changed meanwhile), repeat from step 1 once, then show an error.
5. On success: clear the draft, update local state from the new data, go to History.

Commit message: `Session 2026-10-17: Dan 3-2 Damon`. Edits and deletes use the same flow with `Edit session ...` and `Delete session ...` messages. One commit per action, so the repo history is the audit trail and the undo.

Offline or a failed save: keep the draft, show a clear error toast, offer retry. Never lose a draft.

Loading data:

- Read-only mode: `fetch('data.json', { cache: 'no-store' })`. GitHub Pages can take a minute or two to publish a new commit, so Damon may see a night late. Acceptable.
- Logger mode: read through the API on load so Dan always sees his own latest save immediately, falling back to `data.json` if the request fails.
- When the app comes back to the front (at most every 30 s), reload quietly: no toast or banner on failure, never during a save, and the draft is never touched.

The repo is public (Pages on private repos needs a paid plan). Names and scores are public. That is fine for this app.

## Design tokens

Dark, snooker-baize green. Chalk-white text. Yellow for Dan, light blue for Damon, used for dots, names, score digits, bars and chart lines everywhere. Colours that identify a player must also be labelled with the name (never colour alone).

| Token | Hex | Use |
|---|---|---|
| Background | `#0E2F25` | page |
| Card | `#154634` | cards, active tab |
| Card, raised | `#1C5740` | secondary buttons |
| Card, inset | `#123D2D` | expanded history rows |
| Tab bar | `#0A261D` | bottom bar |
| Line | `#2A6A50` | borders, dividers |
| Text | `#F4F1E8` | main text |
| Muted text | `#A8C7B8` | labels, secondary text |
| Dan | `#F2C94C` | yellow |
| Damon | `#8EC5FF` | light blue |
| Red ball | `#E0533D` | logo, intro |
| Error | `#B33A28` | error toast (white text 5.2:1; the red ball is only 3.4:1) |
| Primary button | `#F4F1E8` on `#0E2F25` text | Confirm, Save |

Type: Barlow Condensed 700 for big numbers, titles and the wordmark (titles 36 px, score 64 px, stat numbers 22 to 64 px); Barlow 400 to 600 for everything else (body 14 to 16 px, labels 12 to 13 px). Small uppercase labels use 0.12em letter spacing.

Shape: cards 16 px radius, buttons 12 to 14 px, minimum touch target 44 px, 12 px gaps, 20 px side padding. Icons are 1.8 px stroke line icons.

Accessibility: real `button` and `a` elements, `aria-label` on icon-only buttons, `aria-pressed` on toggle buttons, text contrast at least 4.5:1, respect `prefers-reduced-motion`.

## Splash and intro

Name: **Frames**. Tagline: "Head to head, frame by frame".

Logo: six red balls in a triangle above a white cue ball in a rounded dark-green tile (`design/6-splash.png`, `design/7-app-icon-1024.png`). The icon is the same mark filled edge to edge with no rounding (the phone rounds it).

**Static splash (iOS).** A home-screen web app shows an image while it launches. Provide `apple-touch-startup-image` links for the common iPhone sizes using the splash design (background `#0E2F25`, logo, wordmark, tagline centred). Generate the sizes from `design/6-splash.png` or rebuild it from the HTML in the reference file.

**Animated intro (in the page).** `design/intro-reference.html` is the finished animation as plain HTML, CSS keyframes and inline SVG on a 390 x 900 stage. It loops every 8 seconds for preview and ends on a copy of the Session screen. In the app:

- Play it once per launch, as an overlay above the app, then remove the overlay. Total about 3 seconds.
- Run the keyframes once (`animation-iteration-count: 1`, `animation-fill-mode: forwards`) and remove the overlay on `animationend`. Tap anywhere to skip. Do not replay when switching tabs.
- If `prefers-reduced-motion: reduce`, skip the intro and show the static splash briefly, or go straight to the app.
- Scale the 390 x 900 stage to the viewport (keep the aspect, centre it, fill the rest with `#0E2F25`).
- Load data while it plays. The app screen behind the overlay should be ready when it finishes. Never make the intro wait for the network.

The sequence, in seconds from launch:

| Time | What happens |
|---|---|
| 0.00 to 0.22 | Table fades in: cushions, six pockets, baulk line and D, six colours on their spots, red triangle, cue ball in the D |
| 0.14 to 0.36 | Cue stick appears behind the white, then thrusts and strikes at 0.36 |
| 0.36 to 0.68 | White rolls up the table and hits the rack at 0.68 (ease-in) |
| 0.68 to 0.97 | Impact ring flashes where they meet; the white rolls on a little (ease-out) |
| 0.68 to 1.30 | Reds scatter. One drops in the right middle pocket (about 0.97), one in the top-left corner pocket (about 1.15); the other four spread out and rest |
| 1.35 to 1.60 | Table fades out to plain green |
| 1.60 to 1.85 | Logo, "FRAMES" and tagline fade in |
| 1.85 to 2.50 | Hold |
| 2.50 to 2.75 | Splash fades out to plain green |
| 2.75 to 3.00 | App (Session screen) fades in |

Each fade goes fully out to plain green before the next screen fades in. Do not crossfade the layers: the half-faded overlap looks muddy. The pot is a shrink-and-fade at the pocket. The colour spots are real snooker spots (green, brown and yellow on the baulk line with brown in the middle, blue on the centre spot, pink and black up the table, the pink touching the apex red; if you know the real left-right order of green and yellow, check the reference file against it). Balls are small and the table is drawn to roughly real proportions on purpose; do not enlarge the balls.

## Build order

1. Scaffold the page, tab bar, hash routing and the design tokens. Make read-only vs logger mode switchable by a flag.
2. `stats.js` with unit tests against a small hand-written `data.json`. This is the core of the app, get it right first.
3. Session screen with the localStorage draft: add, edit, remove frames. Then Confirm writing to a local `data.json` copy for now.
4. History, then Stats, then Charts.
5. GitHub load and save (`github.js`) plus Settings and the token flow. Test with a throwaway repo.
6. Read-only mode for Damon.
7. Manifest, icons, static splash, then the animated intro from `design/intro-reference.html`.
8. Polish: empty states (no sessions yet), error toasts, 44 px targets, test on a real phone from the home screen.

## Empty and error states

- No sessions yet: Stats, Charts and History show a friendly empty message pointing Dan at the Session tab (Damon just sees "Nothing logged yet").
- One session only: charts still draw, streak and average values are valid.
- Failed load: show a retry button; keep whatever was last loaded.
- Failed save: keep the draft, show what went wrong (bad token, no network, conflict), retry.

## Not in scope

No ball-by-ball live scoring (there is a physical scoreboard at the table), no handicaps, no drill log, no session notes, no accounts. Do not add any of these.

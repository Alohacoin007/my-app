# Alpexa Sports — Frontend Handoff

A complete sportsbook frontend (marketing site + betting dashboard) built as **static, single-file HTML pages** with inline CSS and vanilla JavaScript (no framework, no build step). This document is the integration brief for wiring these screens to a real app/backend.

All values, odds, balances, bets, and wallet data are currently **demo/in-memory or localStorage**. Nothing talks to a server yet. The goal of the next phase is to replace the demo state with real APIs.

---

## 1. File inventory

| File | Type | Purpose |
|---|---|---|
| `index.html` | Marketing | Landing page. Hero + interactive **live odds board → bet slip** demo, features, CTA, footer. |
| `sports.html` | Marketing | Sports/leagues list. Each card opens an **odds preview modal** ("Sign up to bet"). |
| `promotions.html` | Marketing | Promotions/offers. |
| `introducing-broker.html` | Marketing | Affiliate/IB program + application form. |
| `legal.html` | Marketing | Compliance hub (Risk / KYC / AML / Licensing / Privacy tabs). |
| `signup.html` | Auth | Account creation (demo). |
| `login.html` | Auth | Login (demo). |
| `dashboard.html` | App | **Main betting board** — sports sidebar, live odds board, bet slip (Parlay/Singles), My open bets panel with cash-out, balance, live odds simulation. |
| `my-bets.html` | App | Open / settled bets with live cash-out. |
| `wallet.html` | App | USDT wallet — deposit (Crypto ERC20 / Bank / Zelle), withdraw, P2P send (QR), transaction history. |
| `settings.html` | App | Account, preferences, notifications, security, responsible gaming. |
| `team.html` | App | Team detail page (sample). |
| `team-hub.html` | App | Team hub (tabs: Overview / Schedule / Stats / Squad / Standings). |

---

## 2. Shared conventions

- **No framework.** Each page is one HTML file with a `<style>` block and one or more `<script>` blocks. Safe to migrate into a component framework (React/Vue/Svelte) — the markup and CSS are clean and self-contained.
- **Theming:** CSS custom properties on `:root` with a `body.light` / default-dark override. Brand accent is **royal blue `#1e40d8`** across all pages. Headings/logo use **Space Grotesk** (Google Fonts).
- **Logo:** royal-blue "A" mark + uppercase "ALPEXA SPORTS" wordmark (consistent on every page).
- **External deps (CDN):** Google Fonts (`fonts.googleapis.com`), `qrcodejs` from cdnjs (wallet QR codes). Self-host these for production.

### localStorage keys in use
| Key | Set by | Meaning |
|---|---|---|
| `alpexa_login` | signup/login (`'1'`) | crude logged-in flag; cleared on Log out. **Replace with real session/JWT.** |
| `alpexa_theme` | every page (`'light'`/`'dark'`) | theme preference. Keep or move to user profile. |
| `alpexa_openbets` | dashboard | open-bets count for the My Bets badge. **Replace with API count.** |
| `alpexa_settings` | settings | toggles/selects (notifications, odds format, etc.). **Replace with user prefs API.** |

---

## 3. What needs a backend (integration points)

### Auth & session
- `signup.html`, `login.html` currently just set `localStorage.alpexa_login='1'` and redirect to `dashboard.html`.
- **Build:** real registration/login, email/phone verification, session (JWT/cookie), password reset, route guards on app pages.

### User & balance
- Header balance on dashboard/my-bets/wallet/settings is a hardcoded string; dashboard parses it into an in-memory `balance` variable.
- **Build:** `GET /me`, `GET /balance`; push balance updates after bets/deposits/withdrawals.

### Odds feed (read)
- `dashboard.html` has a hardcoded `DATA` array of games + a `setInterval` that randomly nudges live odds (▲▼) and scores — pure simulation.
- `index.html` live board and `sports.html` popup use their own demo odds objects.
- **Build:** real odds/scores feed (provider or internal), ideally websocket/SSE for live updates. Replace the `DATA` array + simulation with feed data; keep the render functions.

### Bet placement (write)
- Dashboard bet slip computes parlay/singles payout and on "Place bet" it deducts balance, adds to the in-memory **My open bets** panel, increments the badge — all client-side.
- **Build:** `POST /bets` (validate stake ≤ balance, lock odds, persist), return bet id; `GET /bets/open` and `GET /bets/settled` for My Bets; `POST /bets/{id}/cashout` for cash-out.

### Wallet (write — sensitive)
- `wallet.html` USDT balance, deposit (Crypto **ERC20** address + QR, Bank transfer, Zelle), withdraw, and P2P send are **all demo**. Addresses are placeholders; no funds move.
- **Build:** licensed **payment provider + on-chain integration**, real deposit addresses, withdrawal processing, P2P transfers, transaction history API, and **KYC gating** before withdrawals. Do **not** ship demo addresses.

### Teams / stats
- `team.html`, `team-hub.html` use illustrative stats, schedule, standings, news.
- **Build:** sports-data provider for rosters, schedules, standings, stats, news.

### Other
- Settings toggles/selects → user-preferences API.
- Introducing Broker form → leads/affiliate API.

---

## 4. Suggested API surface (starting point)

```
POST  /auth/signup            POST  /auth/login            POST /auth/logout
GET   /me                     GET   /balance
GET   /odds?sport=…           WS    /odds/live             (live odds + scores)
POST  /bets                   GET   /bets/open             GET  /bets/settled
POST  /bets/{id}/cashout
GET   /wallet                 POST  /wallet/withdraw       POST /wallet/transfer
GET   /wallet/transactions    GET   /wallet/deposit-address?network=ERC20
GET   /teams/{id}             GET   /teams/{id}/schedule   GET  /standings?league=…
GET   /settings              PUT   /settings
```

Render functions on each page already build the DOM from JS data objects, so wiring is mostly: fetch → replace the demo array → call the existing `render*()`.

---

## 5. Compliance — must be addressed for real money

This is a real-money gambling product. Before going live, implement and verify:
- **Licensing** in each operating jurisdiction (the legal page references a Costa Rica license as placeholder — confirm with counsel).
- **KYC / AML** identity verification and transaction monitoring (gate withdrawals).
- **Age verification (18+)** and geo-restriction/geoblocking.
- **Responsible gaming:** deposit limits, reality-check reminders, self-exclusion (UI stubs exist in `settings.html`).
- **Payments:** use a licensed PSP / regulated on-chain custody; never handle card/bank/crypto credentials in plaintext on the client.
- All "Demo —…" notices must be removed only once the real, compliant flows are in place.

---

## 6. Quick start for the next agent

1. Serve the folder statically to preview (e.g. `python -m http.server`), open `index.html`.
2. Pick a target stack (keep as static + API, or port pages into a framework).
3. Wire auth first (so route guards work), then balance, then odds feed, then bet placement, then wallet (with KYC/PSP), then teams/stats.
4. Replace each demo data array/localStorage usage listed above with API calls; reuse the existing `render*()` functions.
5. Self-host fonts and `qrcodejs`; set up CSP.

Brand: accent `#1e40d8`, display font **Space Grotesk**, dark-default with light theme toggle.

# BetBoard — Sports Betting Dashboard Prototype

A Robinhood Legend-style, widget-based sports betting dashboard built with
Next.js (App Router), Tailwind CSS v4, and react-grid-layout v2.

## Getting started

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Features

- **24x24 grid system** — 24 columns × 24 rows fill the viewport; the row
  height is derived from the screen height (`components/Dashboard.tsx`).
- **Drag & resize** — drag a widget by its header to move it, or drag the
  bottom-right corner to resize. The layout persists to `localStorage` and
  can be restored with the "Reset layout" button.
- **Four widgets**
  | Widget | File | Description |
  |---|---|---|
  | Odds Trend | `components/widgets/OddsTrendChart.tsx` | 24h home/away win odds line chart (SVG, crosshair + tooltip) |
  | Live Odds Board | `components/widgets/LiveOddsBoard.tsx` | Per-match 1X2 odds buttons; clicking adds to the bet slip |
  | Bet Slip | `components/widgets/BetSlip.tsx` | Parlay odds and estimated payout calculation |
  | Schedule · Scores | `components/widgets/GameSchedule.tsx` | Live scores and upcoming games |

## Notes

- All data is mock data in `lib/data.ts`, generated deterministically from a
  seed so server/client hydration stays consistent.
- The theme is dark-only; design tokens live in the `@theme` block of
  `app/globals.css`.

# US Weather Station

> **Try it live:** **[https://weather-station.juyoung-m-yoo.workers.dev/](https://weather-station.juyoung-m-yoo.workers.dev/)**

An interactive 50-state US weather atlas with historical archives, live forecasts, animated Doppler radar, wind streamlines, and printable briefings — with zero API keys required.

[![US Weather Station — 50-State Weather Map (Dark Mode)](docs/screenshot.png)](https://weather-station.juyoung-m-yoo.workers.dev/)

## Features

- **50-State Interactive Map** — Explore temperatures, feels-like, precipitation, wind, humidity, AQI, and UV across all 50 states in light or dark mode.
- **Historical & Live Weather** — Inspect curated US weather events or custom dates back to 1940, or switch to **Live** for current forecasts and active NWS severe alerts.
- **State Details & Top 10 Cities** — Click any state for hourly trends, daily forecasts, and a city selector dropdown, or enable **Detailed State Mode** (`D`) to zoom in on its 10 most populated cities.
- **Radar, Wind & Weather FX** — Overlay animated Doppler radar loops, live wind flow lines, and procedural **Weather FX** (`A`), and scrub across time with the bottom playback dock.
- **Customizable Colormaps & Controls** — Switch or flip colormaps (`C` / `Shift+C`), pan (drag or hold `Space`), zoom (`+`/`-`/`0` or scroll), and export briefings to PDF, PNG, CSV, or JSON.

[![Detailed State Mode — California Top 10 Populated Cities (Dark Mode)](docs/screenshot-detailed.png)](https://weather-station.juyoung-m-yoo.workers.dev/)

## Quickstart

Install dependencies with [Bun](https://bun.sh/) and start the app locally:

```bash
bun install
bun run dev        # Bun full-stack dev server with HMR (http://localhost:3000)
```

<details>
<summary>Other useful commands (build, test, deploy)</summary>

```bash
bun test                         # Run unit, Worker, and API tests
bun run check                    # Typecheck, build, and dry-run Cloudflare deploy
bun run build && bun run deploy  # Build and deploy to Cloudflare Workers
bun run preview                  # Preview the production bundle locally
bun run seed                     # Regenerate the default historical snapshot
```

</details>

## Tech & Data Sources

| Area | Built With |
| :--- | :--- |
| Frontend | React 19, TypeScript, Tailwind CSS v4, `d3-geo` + `us-atlas` |
| Backend & Edge | Cloudflare Workers, Bun (dev & client bundler), Edge Cache API |
| Weather & Radar | Open-Meteo (Forecast, ERA5, Air Quality), NOAA/NWS Alerts, NOAA MRMS & IEM NEXRAD |

## Project Structure

```text
src/
├── client/   # React UI, interactive map, radar/wind overlays, print & export views
├── worker/   # Cloudflare Worker entrypoint & edge cache adapter
├── server/   # API router, Open-Meteo/NWS/radar providers, baseline seed snapshot
└── shared/   # Shared types, state/city tables, phenomena, radar, weather codes, presets, units
tests/        # Unit, Worker, and API test suites
```

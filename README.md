<div align="center">

# US Weather Station

An interactive 50-state US weather atlas with historical archives, live forecasts, animated Doppler radar, wind streamlines, and printable briefings — with zero API keys required.

**Try it live:** **[https://weather-station.juyoung-m-yoo.workers.dev/](https://weather-station.juyoung-m-yoo.workers.dev/)**

<p align="center">
  <a href="https://bun.sh/"><img src="https://img.shields.io/badge/Bun-%3E%3D1.4-FBF0DF?logo=bun&logoColor=white" alt="Bun >=1.4" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-%3E%3D5.8-3178C6?logo=typescript&logoColor=white" alt="TypeScript >=5.8" /></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-%3E%3D19.1-61DAFB?logo=react&logoColor=white" alt="React >=19.1" /></a>
  <a href="https://d3js.org/d3-geo"><img src="https://img.shields.io/badge/d3--geo-%3E%3D3.1-F9A03C?logo=d3&logoColor=white" alt="d3-geo >=3.1" /></a>
  <a href="https://tailwindcss.com/"><img src="https://img.shields.io/badge/Tailwind_CSS-%3E%3D4.1-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS >=4.1" /></a>
  <a href="https://workers.cloudflare.com/"><img src="https://img.shields.io/badge/Cloudflare_Workers-Edge-F38020?logo=cloudflareworkers&logoColor=white" alt="Cloudflare Workers Edge" /></a>
</p>

[![US Weather Station — 50-State Weather Map with Live Weather FX (Dark Mode)](docs/screenshot.png)](https://weather-station.juyoung-m-yoo.workers.dev/)

</div>

## Features

- **50-State Interactive Map** — Explore temperatures, feels-like, precipitation, wind, humidity, AQI, and UV across all 50 states in light or dark mode.
- **Historical & Live Weather** — Inspect curated US weather events or custom dates back to 1940, or switch to **Live** for current forecasts and active NWS severe alerts.
- **State Details & Top 10 Cities** — Click any state for hourly trends, daily forecasts, and a city selector dropdown, or enable **Detailed State Mode** (`D`) to zoom in on its 10 most populated cities.
- **Radar, Wind & Weather FX** — Overlay animated Doppler radar loops, live wind flow lines, and procedural **Weather FX** (`A`, enabled by default in **Live** mode), and scrub across time with the bottom playback dock.
- **Customizable Colormaps & Controls** — Switch or flip colormaps (`C` / `Shift+C`), pan (drag or hold `Space`), zoom (`+`/`-`/`0` or scroll), and export briefings to PDF, PNG, CSV, or JSON.

[![Detailed State Mode — California Top 10 Populated Cities with Weather FX (Dark Mode)](docs/screenshot-detailed.png)](https://weather-station.juyoung-m-yoo.workers.dev/)

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

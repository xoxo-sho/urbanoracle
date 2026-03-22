# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project Overview

UrbanOracle is a Japanese urban data visualization dashboard. It aggregates open-source data (land prices, demographics, disaster risk, transportation, zoning) into an interactive web application with map and chart views.

## Commands

- `npm run dev` — Start dev server (Turbopack)
- `npm run build` — Production build (also runs TypeScript type checking)
- `npm run lint` — Run ESLint
- No test framework is configured yet

## Tech Stack

- **Framework:** Next.js 16 (App Router, `src/` directory)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS v4 + shadcn/ui components
- **Maps:** MapLibre GL JS (loaded via `next/dynamic` with `ssr: false`)
- **Charts:** Recharts
- **Icons:** Lucide React
- **Import alias:** `@/*` maps to `./src/*`

## Architecture

### Layout

The app uses a dashboard-first grid layout (12 columns). The map is one data panel among others, not the main focus. Left column (5/12): map card + transport ranking. Right column (7/12): tabbed panels for demographics and disaster risk. Header contains logo, layer selector, and stats bar.

### Key Patterns

- **MapView is client-only:** MapLibre requires the DOM, so `MapView` is loaded with `next/dynamic({ ssr: false })`. All map-related components must be client components.
- **Data layers:** Toggled via `LayerSelector` at the top. Layer state is managed in the root page component. Each layer corresponds to a `DataCategory` type.
- **Sample data:** Currently uses static sample data in `src/data/sample.ts` (Tokyo wards). This will be replaced with real API integrations (国土数値情報, e-Stat, ハザードマップポータル, etc.).
- **shadcn/ui:** Components live in `src/components/ui/`. Add new ones via `npx shadcn@latest add <component>`.

### Directory Structure (non-obvious)

- `src/types/` — Shared TypeScript interfaces for all data categories
- `src/data/` — Static sample data (to be replaced by API calls)
- `src/components/map/` — MapLibre map components (client-only)
- `src/components/dashboard/` — Dashboard panels and charts

## Language

UI text and data labels are in Japanese. Code (variable names, comments) is in English.

# GigaTIME — Frontend

Production-quality UI for the **GigaTIME** computational-pathology platform
(virtual mIF from H&E). This repository is the **frontend / UI layer only** and
runs entirely on **mock data**. It is structured to drop onto a Django + GCP
backend with minimal changes.

> **Research Use Only.** Not intended for clinical diagnosis.

## Tech stack

- **React 18** (state-based navigation — no React Router, no Redux)
- **Tailwind CSS** (class-based dark mode, custom biotech design system)
- **lucide-react** icons · **recharts** charts
- **Vite** build tooling

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build → dist/
npm run preview  # preview the production build
```

## Project structure

```
src/
  api/          # Data layer — the ONLY place that talks to "the backend"
    slidesApi.js  #   mock-backed; mirrors the planned REST endpoints
  components/   # Reusable presentational components (13)
  pages/        # Top-level views switched via app state
  data/         # Mock fixtures (slides, protein channels)
  hooks/        # useTheme (persisted dark mode), useMockSlides (data access)
  utils/        # constants (design tokens, enums) + helpers (formatting)
  App.jsx       # Orchestrator: auth/consent gates, navigation, layout
```

## Design system

Minimal, data-forward biotech SaaS aesthetic (Linear / Vercel / Retool feel) —
clean white / light-grey surfaces, **emerald green** (#059669) for active states
and primary actions, **warm orange** (#F97316) for alerts/running states, on a
neutral gray scale. Amiri typography (serif; body set to a heavier weight); `rounded-xl` cards with `shadow-sm` and a
green left-accent lift on hover. Light mode is the default; dark mode (charcoal
#111827 / #1F2937) is persisted to `localStorage`. The palette uses Tailwind's
built-in `emerald` / `orange` / `gray` scales (which map 1:1 to the brand hexes),
configured in `tailwind.config.js`.

## Navigation

There is no router. `App.jsx` holds a `page` state value (see `PAGES` in
`utils/constants.js`); the Sidebar/Navbar call `navigate(page)` to switch views.
This keeps the app a single bundle and trivially embeddable.

## Connecting the real backend

All data access is isolated in **`src/api/slidesApi.js`**. Components never call
`fetch` directly — they go through the `useMockSlides` hook, which calls the API
layer. To go live, replace the function bodies in `slidesApi.js` with real calls;
signatures and return shapes are designed to stay identical.

| Function            | Planned endpoint        |
| ------------------- | ----------------------- |
| `listSlides()`        | `GET /api/slides`         |
| `getSlide(id)`        | `GET /api/slides/:id`     |
| `updateSlide(id, p)`  | `PATCH /api/slides/:id`   |
| `deleteSlide(id)`     | `DELETE /api/slides/:id`  |
| `uploadSlide(p)`    | `POST /api/upload`      |

The base URL comes from `VITE_API_BASE` (see `.env.example`); the Vite dev
server can proxy `/api` to Django (commented config in `vite.config.js`).

## Notes

- All downloads, uploads and auth are **mocked** (no signed URLs, no real files).
- Protein scores are generated deterministically per slide in
  `data/mockProteins.js` rather than hardcoded. **CD20** is intentionally shown
  as *Insufficient Sample* — it marks rare B cells that small samples may lack.

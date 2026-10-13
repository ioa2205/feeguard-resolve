# Third-party licences

> **Status on 14 Oct 2026:** the backend versions are pinned in `backend/requirements.txt` and the frontend versions in `frontend/package-lock.json`. The screens are built from our own components, styles and canvas chart; no component, chart or CSS library is used (checked against `frontend/package.json` on 14 Oct 2026).

## AI model

| Component | Licence | Note |
|---|---|---|
| Gemini API (`gemini-3.5-flash`) | Google's API terms | Reads complaints and rewords letters in the demo, on invented data only. Off without a key |
| Local AI model | **Not chosen yet** | A bank plugs one into the same module. The licence must allow commercial use |
| Ollama (runs a local model) | MIT | |

## Backend

| Component | Licence |
|---|---|
| Python | PSF License |
| FastAPI | MIT |
| Uvicorn | BSD-3-Clause |
| Pydantic | MIT |
| pandas | BSD-3-Clause |
| scikit-learn | BSD-3-Clause |
| HTTPX | BSD-3-Clause |
| SQLite | Public domain |
| pytest (tests only) | MIT |

## Frontend

| Component | Licence |
|---|---|
| React | MIT |
| React Router | MIT |
| Vite | MIT |
| TypeScript | Apache-2.0 |

## Fonts

Fonts are installed from npm (Fontsource), bundled into our own build and served from our own server. Nothing is loaded from a font website.

| Font | Used for | Licence |
|---|---|---|
| Onest 5.3.1 | Every screen: FeeGuard's own words and the figures | SIL Open Font License 1.1 |
| Source Serif 4 5.3.1 | The customer's own words, letters and contract clauses | SIL Open Font License 1.1 |

## Deploy

| Component | Licence |
|---|---|
| Caddy | Apache-2.0 |
| Docker Engine | Apache-2.0 |

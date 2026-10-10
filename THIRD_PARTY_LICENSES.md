# Third-party licences

> **Status on 10 Oct 2026:** the backend versions are pinned in `backend/requirements.txt` and the frontend versions in `frontend/package-lock.json`. shadcn/ui and Recharts were planned but are not used: the screens are built from our own components and tables (checked against `frontend/package.json` on 11 Oct 2026). Before submission (task S5) this file is checked again against the real lock files, and exact versions are added.

## AI model

| Component | Licence | Note |
|---|---|---|
| Local AI model | **Not chosen yet** | Chosen in task B1. The licence must allow commercial use |
| Ollama (runs the model) | MIT | |

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
| Tailwind CSS | MIT |

## Fonts

Fonts are installed from npm, bundled into our own build and served from our own server. Nothing is loaded from a font website.

| Font | Licence |
|---|---|
| Fira Sans | SIL Open Font License 1.1 |
| Fira Sans Condensed | SIL Open Font License 1.1 |
| Charis SIL | SIL Open Font License 1.1 |

## Deploy

| Component | Licence |
|---|---|
| Caddy | Apache-2.0 |
| Docker Engine | Apache-2.0 |

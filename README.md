# Helios // Energy Intelligence

> **STATUS: DEMO / EXPERIMENTAL** — Helios is a code-ready operator surface for meter telemetry, anomaly triage, and field response. The repository includes a deterministic browser demo; a hosted deployment is not claimed.

Helios makes the path from a suspicious meter signal to an actionable response legible: ingest a reading, score an anomaly, persist the case, broadcast the update, and give an operator enough context to investigate. The interface is intentionally built as a command surface rather than a generic analytics dashboard.

![Helios YOR hero](assets/hero.svg)

## What is implemented

- FastAPI REST routes under `/api/v1` for auth, meters, readings, alerts, anomalies, zones, dashboard summaries, recommendations, and sync actions.
- Alert investigation workspace with linked meter/zone/reading context, related anomalies, evidence ledger, audit timeline, score-band uncertainty, and operator actions.
- A WebSocket channel at `/ws/live` for reading, alert, and anomaly frames.
- Next.js App Router frontend with dashboard, alert triage, meter, zone, and analytics views.
- Deterministic local demo mode that emits synthetic frames without requiring a live backend.
- Responsive YOR visual system with a reduced-motion alternative, visible status vocabulary, and semantic severity colors.
- PostgreSQL-first backend configuration with SQLite available for local development; Redis is optional for realtime support.
- Approved local RBAC matrix with viewer-by-default registration, auditable admin role changes, and explicit demo-user role seeding.
- Short-lived session-bound access tokens with hashed opaque refresh tokens, rotation, reuse rejection, and logout revocation.

The demo surface is useful for reviewing navigation, layout, and client-side signal handling. It does not turn synthetic events into evidence of real grid behavior.

## Signal path

![Helios architecture](assets/architecture.svg)

The intended runtime path is:

```text
meter / simulator → FastAPI ingest → anomaly detection → SQLAlchemy store
                                      ↘ WebSocket → Next.js operator surface
```

Detection output is a triage signal. It is not, by itself, proof of tampering, equipment failure, recovered value, or avoided downtime. Field verification and an appropriately configured production environment remain separate requirements.

## Evidence ledger

| Surface | Status | Evidence / boundary |
| --- | --- | --- |
| Frontend production build | **VERIFIED** | `npm run build --prefix frontend` completes and generates the current App Router routes. |
| YOR token contract | **VERIFIED** | `npm run design:check` validates `design/yor-tokens.json`. |
| Browser demo emitter | **VERIFIED** | `frontend/lib/demo.ts` emits deterministic local reading and alert frames. |
| Backend integration | **VERIFIED (LOCAL)** | Final Docker Compose runtime passed liveness/readiness, authenticated API, investigation detail, CORS/security headers, idempotent ingestion, and authenticated WebSocket event delivery. This is not a hosted deployment claim. |
| Hosted URL / uptime | **UNVERIFIED** | No live URL is published in this repository. |
| Production telemetry / recovery metrics | **NOT CLAIMED** | The repository contains no validated production dataset or operational measurement. |

## UI previews

The images below are code-authored compositions of the current interaction model. They are deliberately labeled as synthetic or illustrative; they are not screenshots of production telemetry.

![Dashboard preview](docs/screenshots/dashboard.svg)
![Alert triage preview](docs/screenshots/alerts.svg)
![Alert detail preview](docs/screenshots/alert-detail.svg)
![Mobile evidence preview](docs/screenshots/mobile-evidence.svg)

## Local verification and release gates

The repository can be verified locally, but local verification is not a hosted production claim. Run the backend migration before starting the API, and use the explicit production configuration checks before deploying:

```powershell
# frontend
npm ci --prefix frontend --legacy-peer-deps
npm run lint --prefix frontend
npm run typecheck --prefix frontend
npm run build --prefix frontend
npm audit --prefix frontend --omit=dev

# backend
backend/.venv/Scripts/python.exe -m pytest backend/tests/ -v --tb=short
backend/.venv/Scripts/python.exe -m alembic -c backend/alembic.ini upgrade head
backend/.venv/Scripts/python.exe ml-engine/evaluation/evaluate.py --out $env:TEMP/helios-evaluation.json
```

Copy `.env.example` to `.env` for local configuration. Production must use PostgreSQL and Redis, a JWT secret of at least 32 characters, and a JSON CORS allow-list. `/health` is liveness; `/ready` is the dependency-aware readiness gate. A passing build or local demo does not verify a hosted URL, external identity provider, payment provider, durable backups, or real telemetry.

## Local frontend check

```powershell
npm ci --prefix frontend
npm run design:check
npm run build --prefix frontend
npm run start --prefix frontend
```

Open `http://localhost:3000/`. The dashboard routes can be inspected without a backend by entering demo mode from the login screen or by opening `/dashboard?demo=silent`.

For a full local stack, use Docker Compose or the repository's setup scripts after configuring the backend environment. The frontend defaults to `http://localhost:8000`; set `NEXT_PUBLIC_API_URL` when the API lives elsewhere.

## Demo mode

Demo mode is intentionally local and repeatable. It stores only the `helios.demo` flag in browser storage and broadcasts synthetic frames through the shared client listener. Use it to inspect the interaction choreography, not to validate backend persistence or field evidence.

## Runtime boundaries

- Production requires a real `DATABASE_URL`, a strong `JWT_SECRET`, and an explicit CORS allow-list. The backend is expected to refuse unsafe production configuration.
- Public production also requires a complete account lifecycle and hosted identity controls; the local beta enforces the approved RBAC matrix and database-backed token revocation, but does not claim email verification, password reset, or account deletion.
- SQLite is a local-development fallback, not a claim of durable serverless production storage.
- The optional ML/detection hooks are architecture seams; model quality, calibration, and field accuracy require a separately versioned dataset and evaluation protocol.
- Demo credentials, if seeded by a local script, are for local testing only. Never reuse them in a public deployment.
- No image, location, alert, financial, or uptime metric in the previews should be read as operational evidence.

## API surface

- `GET /health` and `GET /ready`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`
- `POST /api/v1/users/` (new accounts are always `viewer`), `PATCH /api/v1/users/{user_id}/role` (admin only)
- `GET /api/v1/meters`, `GET /api/v1/readings/by-meter/{meter_id}`
- `GET /api/v1/alerts`, `GET /api/v1/alerts/{alert_id}`, `POST /api/v1/alerts/{alert_id}/assign`, `PATCH /api/v1/alerts/{alert_id}/resolve`
- `GET /api/v1/anomalies`, `GET /api/v1/zones`, `GET /api/v1/dashboard/summary`
- `ws://<host>/ws/live`

### Local authorization matrix

The API enforces these permissions server-side from the current database role; frontend visibility is not an authorization boundary.

| Capability | Allowed roles |
| --- | --- |
| Read telemetry, dashboard, alerts, zones, meters, recommendations, and investigations | `admin`, `operator`, `inspector`, `viewer` |
| Assign/resolve alerts and upload evidence | `admin`, `operator`, `inspector` |
| Ingest readings, apply sync actions, and trigger the local demo alert | `admin`, `operator` |
| Create meters/zones and change user roles | `admin` (the `administrator` alias is accepted for existing data) |
| Register a new account | Public endpoint; the server always assigns `viewer` |

Refresh tokens are opaque and stored only as SHA-256 hashes in `auth_sessions`. Each refresh rotates the session, reuse of a previous token fails, and logout revokes the authenticated session. Email verification, password reset, and account deletion still require an external identity/email decision.

## Repository map

```text
frontend/        Next.js operator surface and deterministic demo emitter
backend/         FastAPI service, persistence, auth, and WebSocket routes
data-simulator/  local reading generation
ml-engine/       detection-related seams and experiments
docs/            evidence-labeled visual references
design/          shared YOR visual tokens and contract check
```

## Attribution and contributions

Helios may contain contributions from more than one author. Preserve existing attribution and review history when extending it. Open a focused issue or pull request with the behavior, test evidence, and deployment assumptions stated explicitly.

## License

No license is declared yet. Treat the repository as all-rights-reserved until an explicit license file is added.

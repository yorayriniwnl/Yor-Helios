# Demo Guide

A concise guide for running a short demo of Helios: how to start the system,
what to show, and the key talking points to cover.

## 1. Start the system

- Recommended (Docker):

```bash
docker compose up --build
# seed demo data
docker compose exec backend python backend/scripts/seed.py
```

- Quick local (dev):

```bash
# Backend (run from the repository root so package imports match CI/container execution)
pip install -r backend/requirements.txt
python -m alembic -c backend/alembic.ini upgrade head
python -m uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000

# Frontend
cd ../frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

Verify health: `http://localhost:8000/health` (should report DB and Redis status).

## 2. What to show in the demo

- Landing / Login
  - Use seeded credentials: `admin@example.com / adminpass123` (created by `backend/scripts/seed.py`).

- Dashboard
  - KPI cards (overall consumption, active alerts)
  - Consumption chart for a sample meter

- Realtime Alerts
  - Show the AlertFeed on the dashboard receiving live alerts via WebSocket.
  - Simulate an anomaly by POSTing a large reading to `/api/v1/readings` or by running the seed script.

- Alerts page
  - Demonstrate assigning/resolving an alert and how the UI updates.

- Meter drill-down
  - Open a meter, show historical consumption and any anomalies.

- Zones overview
  - Show zone-level aggregation and risk indicators.

## 3. Key talking points

- Architecture
  - Backend: FastAPI + SQLAlchemy, WebSocket for realtime updates.
  - Frontend: Next.js (App Router) with a small reactive client subscribing to `/ws/live`.
  - Data store: Postgres (production) and Redis for caching/realtime.

- Anomaly detection
  - Rule-based detectors with a pluggable ML hook (isolation forest stub available).
  - Alerts are persisted and broadcast to connected clients.

- Observability & ops
  - Health check (`/health`) reports DB and Redis connectivity.
  - Logging and request middleware capture requests and errors.

- Extensibility
  - Add detectors, notification channels (email/SMS), or external ML models.

- Next steps for production
  - Add DB migrations, secure secrets, run behind a process manager/load balancer.

## 4. Short demo script (5–7 minutes)

1. Start services and seed data.
2. Open `http://localhost:3000` and login as `admin@example.com`.
3. Walk through dashboard KPIs and a meter drill-down.
4. Trigger a simulated anomaly and show realtime AlertFeed updating.
5. Go to Alerts page, assign/resolve an alert, and explain backend flow.

---

Keep the demo focused: highlight realtime flow, anomaly detection, and how the UI reflects alerts.

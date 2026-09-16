# Deployment helpers

This folder contains guidance for deploying the Helios backend.

1. Generate Alembic migrations (if you modified models):

```bash
# from the backend directory
alembic revision --autogenerate -m "describe the change"
alembic upgrade head
```

2. Build the Docker image from the repository root and run (example):

```bash
docker build -f backend/Dockerfile -t helios-backend .
docker run -e ENV=production \
  -e DATABASE_URL="postgresql://user:pass@db:5432/helios" \
  -e JWT_SECRET="<strong-secret>" \
  -e REDIS_URL="redis://redis:6379/0" \
  -e CORS_ALLOWED_ORIGINS='["https://app.example.com"]' \
  -p 8000:8000 helios-backend
```

3. Recommended env vars:

- `ENV` or `HELIOS_ENV`: `production`
- `DATABASE_URL`: PostgreSQL or another production DB
- `JWT_SECRET`: cryptographically random secret (>=32 characters)
- `REDIS_URL`: required in production for shared rate limits and cache state
- `CORS_ALLOWED_ORIGINS`: JSON array of explicit allowed frontend origins
- `SLOW_QUERY_MS`: optional slow query profiler threshold (ms)
- `LOG_LEVEL`: `INFO` or `WARNING` for production

4. Notes

- The backend will fail-fast on startup if critical production settings are missing or insecure (see `backend/app/core/config.py`).
- Keep `.env` files out of source control; `.gitignore` already excludes them.

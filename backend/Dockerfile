# Simple Dockerfile for Helios backend
# Uses official Python slim image, installs requirements, and runs uvicorn

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Allow build-time override of environment (default to production for images used in deploy)
ARG ENV=production
ENV ENV=${ENV}
ENV HELIOS_ENV=${ENV}
ENV LOG_LEVEL=info
ENV PORT=8000

WORKDIR /app

# Copy only requirements first to leverage Docker cache. Keep the repository
# package layout in the image so `backend.app.*` absolute imports resolve the
# same way they do in local and CI runs.
COPY backend/requirements.txt ./backend/requirements.txt

# Install dependencies
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r backend/requirements.txt

# Copy application code
COPY backend/ ./backend/

# ml-engine lives beside backend/ in the repository. Keep it beside the
# package in the image so the same parents[3]-based path resolution works in
# local, CI, and container execution.
COPY ml-engine/ ./ml-engine/

# Expose the app port (expand at build time)
EXPOSE ${PORT}

# Run the FastAPI app with Uvicorn. Use shell form so env vars are expanded.
CMD ["sh", "-c", "python -m alembic -c backend/alembic.ini upgrade head && uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT} --log-level ${LOG_LEVEL}"]

# Helios Release Evidence — 2026-09-13 continuation audit

This document preserves the 2026-09-02 baseline evidence and records the approved authentication/RBAC completion pass performed on 2026-09-13.

## Verdict

Helios is ready for a local private-beta/demo review. The implementation, approved local RBAC contract, revocable session lifecycle, ML experiment discipline, Compose runtime, and browser interaction surface are verified locally. Public deployment is not claimed.

## Claim ledger

| Claim | Evidence | Result | Boundary |
| --- | --- | --- | --- |
| Frontend can ship as a production build | Patched files pass direct ESLint and TypeScript checks; an isolated local-copy `next build` on Next.js 15.5.25 completed with exit 0 | **PASS (LOCAL)** | A checkout-native build stalled during filesystem tracing; the isolated run emitted one non-fatal dependency-junction trace warning; no hosted build claim |
| Backend and ML regressions are green | `pytest backend/tests ml-engine/tests -q --tb=short` | **42/42 PASS** | Test fixtures, not field traffic |
| Data contract preserves zero telemetry | Authenticated idempotency probe with zero power and voltage | **PASS** | One controlled runtime probe |
| Alert detail is investigable | `GET /api/v1/alerts/{id}` returns bounded context, evidence, timeline, causes, response, and uncertainty | **PASS** | Seeded Compose data |
| Realtime delivery is ordered and authenticated | `helios-auth` subprotocol, ping/pong, sequence, event ID, failed-client eviction test | **PASS** | In-memory broadcaster; no multi-worker guarantee |
| Browser operator surface is usable | Settled local browser checks at desktop, 390px mobile, and 1920px ultrawide | **PASS** | No Lighthouse or real-device lab claim |
| Dashboard KPIs match alert state | Backend `open_alerts`/`critical_alerts` summary fields plus demo/live browser checks | **PASS** | Seeded Compose data and deterministic demo state |
| Filtered alert actions remain consistent | Critical + open browser filter, assignment removal, and zero action-error check | **PASS** | Client-side demo mutation; live API mutation still needs production provider verification |
| Evidence upload rejects obvious MIME spoofing | Signature-aware JPEG, PNG, WebP, and PDF validation plus regression tests | **PASS** | Content sniffing is a first gate, not malware scanning |
| Authentication enforcement | Bearer authentication, active-user checks, rate-limited registration, and self/admin user-read boundary | **PASS** | Protected API and WebSocket entry points reject unauthenticated access |
| Local RBAC mutation matrix | Direct route tests cover viewer, inspector, operator, admin, viewer-only registration, admin role changes, and last-admin protection | **PASS (LOCAL)** | API/unit proof; hosted identity and deployment remain unverified |
| Session refresh and logout lifecycle | Access/refresh bundle, SHA-256 refresh hashes, rotation, reuse rejection, access-token revocation, logout `204`, refresh rate limiting, and client retry with the rotated token | **PASS (LOCAL)** | API/unit proof plus patched frontend static checks; secure cookie policy and hosted identity operations remain unverified |
| Public auth lifecycle | Email verification, password reset, and account deletion are not implemented | **BLOCKED** | Requires an explicit transactional email/identity provider and product policy |
| Hosted production is live | No hosted URL or provider evidence in this checkout | **NOT CLAIMED** | Deployment remains blocked |

## Static verification

- YOR token contract: **PASS** (`npm run design:check`).
- Frontend: patched-file ESLint **PASS**, TypeScript **PASS**; an isolated post-patch Next.js 15.5.25 production build completed with 13 generated routes, 103 kB shared first-load JavaScript, 240 kB dashboard first load, and 121 kB login first load. The checkout-native attempt stalled during filesystem tracing on OneDrive.
- Backend/ML Python compilation: **PASS**.
- Backend plus ML tests: **42 passed** (40 backend, 2 ML).
- Authentication guardrails: **PASS (LOCAL)** for bearer validation, active-user checks, rate-limited registration/refresh, session-bound access-token revocation, protected API/WebSocket entry points, and the approved RBAC route matrix.
- Clean temporary Alembic migration: **PASS** through `004_seed_and_backfill_roles`; auth sessions, role normalization/backfill, meter coordinates, processed actions, and reading idempotency schema were present.
- Production frontend dependency audit: **0 vulnerabilities** across info, low, moderate, high, and critical severities.
- `docker compose config --quiet`: **PASS**.
- CI workflow YAML: **PASS**; the configured test job now covers both `backend/tests/` and `ml-engine/tests/` (remote CI execution is not claimed).
- Production configuration guard: **PASS**; known development JWT fallbacks are rejected even when their length would otherwise pass, and Compose no longer supplies a non-empty fallback secret.

## Runtime verification

- Docker Compose services: backend healthy, PostgreSQL healthy, Redis healthy, frontend running.
- PostgreSQL `pg_isready`: accepting connections; Redis `PING`: `PONG`.
- `/health`: 200 `ok`; `/ready`: 200 `ready`.
- Unauthenticated protected alerts route: 401.
- Authenticated API: alerts 50, zones 3, meters 36, first-meter readings 100, investigation detail 200.
- CORS preflight: 200.
- Security headers: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, restrictive Permissions Policy, CSP present.
- Idempotent zero-valued reading: same reading ID returned twice; zero power and voltage preserved; exact test row cleanup residue was zero.
- WebSocket: selected `helios-auth`, returned `pong`, emitted `reading` with `sequence: 1` and a stable `reading:<id>` event ID; exact test row cleanup residue was zero.
- Backend log scan after the probes: zero query-token log lines, zero tracebacks/internal-server errors, zero insecure-JWT warnings.
- Warm local Compose timing for ten investigation-detail requests: 14.27 ms minimum, 15.25 ms median, 20.21 ms maximum. This is a small local sample, not a p95, load, or production SLO measurement.
- Continuation audit environment check: Docker Desktop was present, but the Linux engine was unavailable; no fresh Compose runtime result is claimed after that interruption. The successful Compose evidence above is from the preceding verified run.

## ML evaluation

The evaluator is a deterministic synthetic holdout with a chronological per-meter split, anomalies injected only after the training boundary, train-only imputation/scaling, and explicit leakage checks. All leakage checks passed.

The current deterministic run scored the rule baseline at PR-AUC 0.5471, ROC-AUC 0.6242, balanced F1 0.6667, and FPR 0.0000. Isolation Forest scored PR-AUC 0.6479, ROC-AUC 0.9754, balanced F1 0.6550, and FPR 0.0116. These are regression signals for the synthetic experiment, not production accuracy. Calibration remains `UNVERIFIED_SCORE_NOT_PROBABILITY`; UI copy calls the output a normalized anomaly score, never a probability.

## Browser and accessibility checks

- Dashboard, alerts, incident detail, zones, meters, and analytics routes rendered without visible unavailable/runtime-error text.
- Dashboard KPI cards now distinguish historical total alerts from currently open and critical alerts; demo anomaly injection updates the open/critical counts.
- Demo mode persists across internal dashboard navigation, does not open an anonymous live WebSocket, and exits cleanly back to the live surface when disabled.
- The source-level auth contract now persists refresh tokens, refreshes one expired access request at a time, rotates both credentials, re-reads the rotated access token for authenticated file downloads, and retries expired-access logout with the rotated refresh token before clearing local credentials; a fresh browser refresh/logout run remains blocked by the unavailable Docker engine.
- Explicit alert severity is preserved in the live feed and alert triage UI instead of being recomputed from a score when the API supplies a severity.
- Stale alert/dashboard requests are ignored after cancellation or route changes; filtered assignment removes the row from the active filtered list without an action error.
- Evidence uploads now require a matching extension, declared MIME type, and recognized file signature before storage.
- Command palette opened with an accessible dialog and six options; searching `critical` navigated to `/dashboard/alerts?severity=critical` and selected the critical filter.
- Incident detail exposed measured telemetry, detector path, score band, uncertainty, possible causes, chain of custody, evidence state, operator note, and assign/resolve controls.
- Alert table investigation links and missing-incident empty state were exercised.
- No unnamed buttons or anchors, and no unlabeled form controls, remained across the inspected dashboard, alerts, meters, zones, analytics, and incident routes.
- At 390px viewport: body/document width 375px and no horizontal overflow.
- At 1920px viewport: body/document width 1905px and no horizontal overflow.
- Browser error/warning log after the final pass: zero entries.
- A settled 1440×900 incident screenshot was visually inspected; no obvious clipping or broken hierarchy was observed.

## Remaining blockers

- This checkout has no `.git` directory, commit history, or configured GitHub remote. No commit or push can truthfully be reported.
- No hosted URL, CI result, domain, TLS, secrets manager, external identity provider, durable backup, or live telemetry provider was verified.
- The local Docker engine must be restored before repeating the Compose runtime probe; this is an environment blocker, not a source-code failure.
- Public auth is not release-complete: password reset, email verification, and account deletion require an identity/provider and product-policy decision. Local RBAC and refresh/revocation are implemented and test-verified, but are not a hosted identity or production deployment claim.
- ML calibration, field accuracy, and the stated precision targets require labeled inspection outcomes and a separately versioned field dataset.
- Formal Lighthouse, cross-browser matrix, load/stress, multi-worker WebSocket, backup-restore, and production observability checks remain unperformed.

## Reproduction commands

```powershell
npm run lint --prefix frontend
npm run typecheck --prefix frontend
npm run build --prefix frontend
backend/.venv/Scripts/python.exe -m pytest backend/tests ml-engine/tests -q --tb=short
backend/.venv/Scripts/python.exe ml-engine/evaluation/evaluate.py --out $env:TEMP/helios-evaluation.json
docker compose config --quiet
docker compose up -d --build
```

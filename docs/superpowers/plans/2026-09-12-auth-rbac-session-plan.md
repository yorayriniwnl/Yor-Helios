# Helios Authentication and Authorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce the approved least-privilege role matrix and add revocable database-backed refresh/logout sessions to Helios while preserving the local private-beta boundary.

**Architecture:** Keep `get_current_user` as the single bearer-authentication boundary, add a session repository/model for hashed opaque refresh tokens, and attach `require_roles(...)` directly to sensitive FastAPI routes. Registration creates `viewer` users only; demo seed data receives explicit roles; provider-dependent email and account-lifecycle features remain documented blockers.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, Pydantic, PyJWT, pytest, Next.js App Router, TypeScript, Zustand, SQLite test database, PostgreSQL/Redis Docker Compose.

**Spec:** `docs/superpowers/specs/2026-09-12-auth-rbac-design.md`

## Execution status — 2026-09-13

- [x] Tasks 1–6 implemented: session storage, token rotation, auth routes, RBAC, role migration/seed repair, and documentation.
- [x] Backend regression suite: 40 passed; ML suite: 2 passed; patched frontend files pass direct ESLint and TypeScript checks, and the last completed Next.js 15.5.25 production build passed.
- [x] Clean Alembic chain verified through `004_seed_and_backfill_roles` on temporary SQLite.
- [x] Final frontend audit fixed expired-access logout retry payloads and stale authenticated-download headers; targeted lint/typecheck and isolated production-build checks pass.
- [ ] Checkout-native build tracing remains slow on OneDrive, and Compose/browser live-session verification remains blocked by the unavailable Docker Linux engine.
- [ ] Commit/push remains unavailable because this checkout has no `.git` directory or configured remote.

## Global Constraints

- Never trust frontend route visibility, local storage, or role claims for authorization; enforce permissions in FastAPI dependencies.
- New registrations must always receive `viewer` and must not accept a client-supplied role.
- Refresh tokens are opaque, hashed at rest, rotated on use, never logged, and invalidated on logout or reuse detection.
- Access tokens remain short-lived and include a session identifier when issued through the session-aware login flow.
- Missing, expired, revoked, inactive, malformed, or mismatched credentials fail closed with `401`; insufficient roles return `403` without exposing policy details.
- Migrations are additive and must run cleanly on SQLite and PostgreSQL without dropping user data.
- Email verification, password reset, account deletion, hosted deployment, GitHub publication, and live providers remain explicit external blockers.
- Use test-first changes: write each regression test, run it to observe the expected failure, implement the smallest fix, then run the focused and full suites.
- The current checkout has no `.git` directory or remote; do not initialize a repository or fabricate commits/pushes.

---

### Task 1: Add database-backed authentication sessions

**Files:**
- Create: `backend/app/models/auth_session.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/app/repositories/auth_session_repository.py`
- Create: `backend/alembic/versions/003_add_auth_sessions.py`
- Create: `backend/tests/test_auth_sessions.py`

**Interfaces:**
- `AuthSession` fields: integer base id, `session_id`, `user_id`, `refresh_token_hash`, `expires_at`, `revoked_at`, `replaced_by`, and `last_used_at`.
- Repository functions:
  - `create_session(db, user_id, session_id, refresh_token_hash, expires_at) -> AuthSession`
  - `get_session_by_id(db, session_id) -> Optional[AuthSession]`
  - `get_session_by_refresh_hash(db, refresh_token_hash) -> Optional[AuthSession]`
  - `revoke_session(db, session, replaced_by=None) -> AuthSession`
- Migration revision `003_add_auth_sessions` creates the table and indexes `session_id`, `user_id`, `refresh_token_hash`, `expires_at`, and `revoked_at`.

- [ ] **Step 1: Write failing repository/model tests.**

```python
def test_session_round_trip_and_revocation(db, user):
    session = create_session(db, user.id, "sid-1", "hash-1", future_time)
    assert get_session_by_id(db, "sid-1").user_id == user.id
    assert get_session_by_refresh_hash(db, "hash-1").session_id == "sid-1"

    revoke_session(db, session)
    db.refresh(session)
    assert session.revoked_at is not None
```

- [ ] **Step 2: Run the focused test and confirm it fails because the model/repository is absent.**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_auth_sessions.py -q`

Expected: collection/import failure naming the missing `AuthSession` implementation.

- [ ] **Step 3: Implement the model, repository, registry import, and additive Alembic migration.**

Use `String` identifiers and SHA-256 hash strings so the same model works on SQLite and PostgreSQL. Store timestamps in UTC and make repository commits rollback on failure, matching existing repository conventions.

- [ ] **Step 4: Run focused tests and a clean migration.**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_auth_sessions.py -q`

Run from `backend`: `..\backend\.venv\Scripts\python.exe -m alembic -c alembic.ini upgrade head` with a temporary SQLite `DATABASE_URL`.

Expected: focused tests pass and Alembic reaches `003_add_auth_sessions`.

- [ ] **Step 5: Inspect the schema and run the full backend suite.**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests -q`

Confirm the new table and indexes exist and no existing test regresses.

### Task 2: Add secure refresh-token primitives and auth service flows

**Files:**
- Modify: `backend/app/core/security.py`
- Modify: `backend/app/services/auth_service.py`
- Create: `backend/tests/test_auth_session_service.py`

**Interfaces:**
- `create_refresh_token() -> tuple[str, str]` returns the raw token and its SHA-256 hash.
- `hash_refresh_token(token: str) -> str` returns a deterministic digest without logging the raw token.
- `create_access_token(user_id: int, expires_delta: Optional[timedelta] = None, session_id: Optional[str] = None) -> str` adds `sid` when supplied and keeps `HS256` algorithm pinning.
- `login_with_session(db, email: str, password: str) -> dict` returns `access_token`, `refresh_token`, `token_type`, and `expires_in`.
- `refresh_session(db, refresh_token: str) -> dict` rotates a valid session and raises `ValueError` for invalid, expired, revoked, or reused tokens.
- `revoke_session_for_refresh_token(db, refresh_token: str) -> None` revokes the matching session without revealing whether a token existed.

- [ ] **Step 1: Write failing service tests for login, rotation, reuse, expiry, and revocation.**

```python
def test_refresh_rotates_and_rejects_the_previous_token(db, user):
    first = login_with_session(db, user.email, "password123")
    second = refresh_session(db, first["refresh_token"])
    assert second["refresh_token"] != first["refresh_token"]
    with pytest.raises(ValueError):
        refresh_session(db, first["refresh_token"])


def test_logout_revokes_refresh_session(db, user):
    bundle = login_with_session(db, user.email, "password123")
    revoke_session_for_refresh_token(db, bundle["refresh_token"])
    with pytest.raises(ValueError):
        refresh_session(db, bundle["refresh_token"])
```

- [ ] **Step 2: Run the focused service tests and verify expected failures.**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_auth_session_service.py -q`

Expected: missing function/signature failures, not fixture or syntax errors.

- [ ] **Step 3: Implement random opaque refresh tokens, SHA-256 hashing, session creation, and rotation.**

Use `secrets.token_urlsafe(48)` for raw refresh material. Generate a fresh `session_id` on every rotation, revoke the previous row before creating the replacement, and mark a reused revoked token as invalid without returning token details. Keep access token expiry at 15 minutes unless an existing test requires a narrower explicit value.

- [ ] **Step 4: Run focused tests and preserve the legacy `login(...) -> str` compatibility wrapper.**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_auth_service.py backend/tests/test_auth_session_service.py -q`

Expected: both existing login tests and new lifecycle tests pass.

- [ ] **Step 5: Add access-token session validation to `get_current_user`.**

When a JWT contains `sid`, load that session and reject it if revoked, expired, or absent. Continue accepting pre-session JWTs until expiry for compatibility, but never allow a revoked session token through. Add a focused test proving logout invalidates a session-bound access token.

### Task 3: Expose refresh and logout API contracts

**Files:**
- Modify: `backend/app/api/v1/routes/auth.py`
- Modify: `backend/app/dependencies/auth.py`
- Modify: `backend/app/main.py` only if dependency registration requires it
- Modify: `backend/tests/test_api_endpoints.py`
- Create: `backend/tests/test_auth_routes.py`

**Interfaces:**
- `POST /api/v1/auth/login` returns `{access_token, refresh_token, token_type: "bearer", expires_in}`.
- `POST /api/v1/auth/refresh` accepts `{refresh_token}` and returns the same response shape.
- `POST /api/v1/auth/logout` accepts `{refresh_token}` and requires the current authenticated session; it returns `204` with no body.
- `get_current_session(...) -> AuthSession` validates the current bearer token and resolves its `sid`.

- [ ] **Step 1: Write failing route tests.**

```python
def test_refresh_returns_rotated_token(client, seeded_user):
    login = client.post("/api/v1/auth/login", json=credentials)
    refreshed = client.post("/api/v1/auth/refresh", json={"refresh_token": login.json()["refresh_token"]})
    assert refreshed.status_code == 200
    assert refreshed.json()["refresh_token"] != login.json()["refresh_token"]


def test_logout_revokes_session(client, seeded_user):
    login = client.post("/api/v1/auth/login", json=credentials)
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    response = client.post("/api/v1/auth/logout", headers=headers, json={"refresh_token": login.json()["refresh_token"]})
    assert response.status_code == 204
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": login.json()["refresh_token"]}).status_code == 401
```

- [ ] **Step 2: Run the route tests and verify expected failures.**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_auth_routes.py -q`

- [ ] **Step 3: Implement Pydantic request/response models and route handlers.**

Rate-limit login and refresh attempts using the existing limiter pattern. Return generic `401` messages for token failures and never include raw refresh tokens in logs or exception text.

- [ ] **Step 4: Implement the frontend session contract.**

Modify `frontend/store/authStore.ts` to persist the returned refresh token, expose an async refresh operation, and call logout best-effort before clearing local state. Modify `frontend/lib/api.ts` to retry one `401` request through `/auth/refresh`, update both tokens, and avoid recursive refresh calls. A failed refresh must clear the auth token and let the caller show the existing error state.

- [ ] **Step 5: Run backend route tests and frontend lint/typecheck.**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_api_endpoints.py backend/tests/test_auth_routes.py -q`

Run: `npm run lint --prefix frontend`

Run: `npm run typecheck --prefix frontend`

### Task 4: Enforce the approved RBAC matrix

**Files:**
- Modify: `backend/app/dependencies/auth.py`
- Modify: `backend/app/api/v1/routes/alerts.py`
- Modify: `backend/app/api/v1/routes/meters.py`
- Modify: `backend/app/api/v1/routes/readings.py`
- Modify: `backend/app/api/v1/routes/sync.py`
- Modify: `backend/app/api/v1/routes/zones.py`
- Modify: `backend/app/api/v1/routes/demo.py`
- Modify: `backend/app/api/v1/routes/users.py`
- Create: `backend/tests/test_rbac.py`

**Interfaces:**
- `require_roles(*allowed_roles: str)` remains the reusable dependency and normalizes role names.
- Route permissions:
  - all authenticated roles: read telemetry, dashboard, alerts, zones, meters, recommendations, and investigations;
  - `admin`, `operator`, `inspector`: alert assignment, resolution, and evidence;
  - `admin`, `operator`: reading ingestion, sync actions, and demo trigger;
  - `admin`: meter/zone creation and role changes;
  - self or `admin`/`administrator`: user lookup;
  - public registration: viewer only.

- [ ] **Step 1: Write failing direct-API RBAC tests.**

```python
@pytest.mark.parametrize("role, expected", [("viewer", 403), ("inspector", 403), ("operator", 200), ("admin", 200)])
def test_reading_ingestion_requires_operator_or_admin(client, role, expected):
    token = token_for_role(role)
    response = client.post("/api/v1/readings/", headers=bearer(token), json=reading_payload)
    assert response.status_code == expected


def test_registration_cannot_escalate_role(client):
    response = client.post("/api/v1/users/", json={**new_user_payload, "role_id": 1})
    assert response.status_code == 200
    assert response.json()["role_id"] == viewer_role_id
```

- [ ] **Step 2: Run RBAC tests and verify failures expose currently unguarded mutations.**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_rbac.py -q`

- [ ] **Step 3: Replace mutation route user dependencies with `require_roles(...)`.**

Keep read routes on `get_current_user`. Use explicit allowed-role tuples in route signatures so OpenAPI and code review show the permission boundary. Do not perform role checks in the frontend.

- [ ] **Step 4: Make registration resolve the `viewer` role server-side.**

Add role repository helpers for case-insensitive lookup and use the viewer role ID from the database. Ignore/reject unknown client fields through the existing Pydantic model; never copy `role_id` from the request.

- [ ] **Step 5: Add admin-only role changes.**

Add `PATCH /api/v1/users/{user_id}/role` with a body containing only an allowed role name. Require `admin`/`administrator`, reject unknown roles with `422`, and write an audit event with actor, target, and resulting role. Do not expose password hashes or refresh material.

- [ ] **Step 6: Run focused RBAC tests and the existing API tests.**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_rbac.py backend/tests/test_api_endpoints.py -q`

Expected: viewers cannot mutate, operators can ingest/triage, inspectors can handle evidence/triage but cannot ingest, and admins can perform all configured mutations.

### Task 5: Provision roles and backfill existing users safely

**Files:**
- Create: `backend/alembic/versions/004_seed_and_backfill_roles.py`
- Modify: `backend/scripts/seed.py`
- Modify: `scripts/seed.py`
- Create: `backend/tests/test_role_migration.py`

**Interfaces:**
- Known roles: `admin`, `operator`, `inspector`, `viewer`.
- Demo users map to roles: Admin User → `admin`, Alice Inspector → `inspector`, Bob Inspector → `inspector`, Carol Operator → `operator`.
- Existing null-role users receive `viewer` during migration; the seed script upgrades only the known demo emails to their explicit demo roles.

- [ ] **Step 1: Write failing migration/seed tests.**

```python
def test_null_role_users_are_backfilled_as_viewers(db, null_role_user):
    run_role_backfill(db)
    db.refresh(null_role_user)
    assert null_role_user.role.name == "viewer"


def test_demo_seed_assigns_named_roles(db):
    seed_demo_users(db)
    assert user_by_email(db, "admin@example.com").role.name == "admin"
    assert user_by_email(db, "alice@example.com").role.name == "inspector"
```

- [ ] **Step 2: Run focused role tests and verify the missing backfill/seed behavior.**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_role_migration.py -q`

- [ ] **Step 3: Implement idempotent role creation and null-role backfill.**

Use case-insensitive existing-name matching, preserve the first role row if duplicates exist, reassign users from duplicate rows before deleting duplicates, and create a unique role-name index only after deduplication. Keep the migration data-preserving.

- [ ] **Step 4: Update both seed entry points.**

Ensure rerunning either seed script does not duplicate roles, changes known demo users to the intended role, and leaves unrelated accounts unchanged.

- [ ] **Step 5: Run migration and seed tests against a fresh temporary SQLite database.**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_role_migration.py -q`

Run the full Alembic chain and inspect `alembic_version`, role rows, user role IDs, and unique indexes.

### Task 6: Update documentation and release evidence

**Files:**
- Modify: `README.md`
- Modify: `docs/release-evidence-2026-09-02.md`
- Modify: `docs/superpowers/specs/2026-09-12-auth-rbac-design.md` only if implementation constraints change
- Modify: `backend/scripts/DEPLOY.md` if production environment variables change

- [ ] **Step 1: Document the implemented route matrix and token lifecycle.**

Include exact local endpoints, viewer-by-default registration, role provisioning, refresh rotation, logout revocation, and the fact that refresh tokens are not logged.

- [ ] **Step 2: Record provider-dependent boundaries honestly.**

Keep email verification, password reset, account deletion, hosted deployment, live telemetry, and external identity provider integration marked `BLOCKED` or `NOT CLAIMED`; do not convert local session support into a production identity claim.

- [ ] **Step 3: Scan the docs for stale counts or contradictory claims.**

Run: `rg -n "26/26|29/29|RBAC|refresh|logout|password reset|email verification|NOT CLAIMED|BLOCKED" README.md docs backend/scripts/DEPLOY.md`

### Task 7: Run the complete verification matrix

**Files:**
- No source changes unless a verification failure identifies a new root cause.
- Evidence update: `docs/release-evidence-2026-09-02.md` (updated with the 2026-09-13 continuation audit)

- [ ] **Step 1: Run backend and ML regressions.**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests ml-engine/tests -q`

- [ ] **Step 2: Run Python compilation, frontend quality gates, and design contract.**

Run: `backend/.venv/Scripts/python.exe -m compileall -q backend ml-engine data-simulator scripts`

Run: `npm run lint --prefix frontend`

Run: `npm run typecheck --prefix frontend`

Run: `npm run build --prefix frontend`

Run: `npm run design:check`

- [ ] **Step 3: Run dependency, migration, and Compose checks.**

Run: `npm audit --prefix frontend --omit=dev --audit-level=high`

Run: `docker compose config --quiet`

Run `docker compose up -d --build` only when the Docker Linux engine is available, then verify Postgres/Redis health, `/health`, `/ready`, login, role-denied mutations, refresh rotation, logout, alerts, and WebSocket behavior.

- [ ] **Step 4: Run browser verification.**

Exercise login, demo mode, refresh after access-token expiry, logout, alert triage, evidence states, internal navigation, 390px mobile, desktop, and ultrawide. Confirm no horizontal overflow, console errors, unnamed controls, or misleading permission affordances.

- [ ] **Step 5: Update the evidence ledger with exact PASS/FAIL/BLOCKED/NOT APPLICABLE results.**

Separate source/unit proof from running-container proof and hosted-provider proof. Record the Docker-engine state and GitHub authentication state if still unavailable.

### Task 8: Finish the development handoff

- [ ] **Step 1: Run `git status --short`, `git rev-parse --show-toplevel`, and `git remote -v`.**

If no repository exists, report that no commit/push is possible and leave files intact. Never initialize a repository or publish without an authenticated remote supplied by the user.

- [ ] **Step 2: Run the final verification command after all edits.**

Repeat the full backend + ML test command and the frontend build command immediately before claiming completion.

- [ ] **Step 3: Report implementation, evidence, and blockers.**

Link the spec, plan, release evidence, migrations, tests, and key route files using absolute workspace paths. State explicitly whether the result is local private-beta ready or production ready.

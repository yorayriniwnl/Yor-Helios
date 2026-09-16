# Helios Authentication and Authorization Design

**Date:** 2026-09-12

**Status:** Approved by user for implementation

## Goal

Make the local Helios operator surface enforce least-privilege authorization on the server and provide revocable database-backed access sessions without pretending that external email delivery or hosted identity exists.

## Scope

### In scope

- Enforce the existing `roles` model through reusable FastAPI dependencies.
- Use this role matrix:

| Role | Read telemetry and investigations | Ingest readings / sync actions | Alert assignment, resolution, and evidence | Create meters/zones | User administration |
| --- | --- | --- | --- | --- | --- |
| `admin` / `administrator` | Yes | Yes | Yes | Yes | Yes |
| `operator` | Yes | Yes | Yes | No | No |
| `inspector` | Yes | No | Yes | No | No |
| `viewer` | Yes | No | No | No | No |

- Make public registration create `viewer` accounts only.
- Assign explicit roles to local demo seed users and safely backfill null roles as `viewer`.
- Add a database-backed session table for refresh tokens, revocation, expiry, and logout.
- Keep access tokens short-lived and bind refresh/logout operations to the authenticated session.
- Add regression coverage for direct API access, forbidden mutations, role assignment, refresh rotation, logout revocation, and expired/revoked sessions.
- Update API documentation and release evidence to distinguish verified local controls from unavailable external identity services.

### Out of scope / external boundary

- Email verification and password reset delivery require a selected transactional email provider and verified sender domain.
- Account deletion requires a retention/legal policy and a destructive-data decision.
- Hosted deployment, GitHub publication, secrets management, and production telemetry require external credentials and infrastructure.

## Architecture

`get_current_user` remains the authentication boundary. New `require_roles(...)` dependencies are attached directly to sensitive routes so hidden UI state, local storage, and direct API calls cannot bypass permissions. The dependency reads the user’s current role from the database rather than trusting a role claim in the JWT.

Refresh sessions are stored as hashes of opaque refresh tokens. The raw token is returned only once to the client. Refresh rotates the token and invalidates the previous hash; logout revokes the current session. Access tokens contain a session identifier so revocation can be checked on protected requests when required by the route. No refresh token is logged.

## Data flow

1. Registration validates input, hashes the password, assigns `viewer`, and returns no elevated capability.
2. Login verifies credentials, creates a session record, and returns a short-lived access token plus refresh token.
3. Protected API routes authenticate the access token and enforce the route’s role dependency.
4. Refresh accepts a valid, unexpired, non-revoked token, rotates the session token, and issues a new access token.
5. Logout revokes the session; subsequent refresh attempts fail with `401`.
6. Role changes remain an admin-only operation and are auditable; no client-provided role is accepted during registration.

## Route policy

- Read-only telemetry, dashboard, alert, zone, meter, recommendation, and investigation routes: all authenticated roles.
- Alert assignment, resolution, and evidence upload: `admin`, `operator`, `inspector`.
- Reading ingestion and sync actions: `admin`, `operator`.
- Meter and zone creation: `admin`.
- Demo alert trigger: `admin`, `operator`.
- User lookup: self, or `admin` / `administrator`.
- Registration: public but always `viewer`.
- Login, refresh, and logout: public/authenticated according to the endpoint contract and rate limited where credentials are supplied.

## Error handling

- Missing, malformed, expired, revoked, or inactive credentials return `401` with `WWW-Authenticate: Bearer`.
- Authenticated users with an insufficient role return `403` without disclosing the required role list.
- Refresh token reuse or mismatch revokes the affected session and returns `401`.
- Database/session failures fail closed and do not return token material or stack traces.

## Migration and compatibility

- Add an additive migration for auth sessions and indexes.
- Keep existing users valid by assigning `viewer` to null-role accounts during migration; the seed script explicitly assigns demo roles afterward.
- Existing access tokens remain accepted until expiry, but cannot perform newly role-gated mutations when their database user lacks an allowed role.
- SQLite development and PostgreSQL Compose environments must both migrate cleanly.

## Testing and release gates

- Unit tests must prove each role’s allow/deny boundary using real route dependencies.
- Auth tests must prove refresh rotation, logout revocation, token expiry, inactive-user rejection, and refresh reuse failure.
- Full backend + ML tests, frontend lint/typecheck/build, migration, Compose configuration, browser demo, accessibility, and security checks must be rerun.
- The final evidence ledger must mark provider-dependent lifecycle and hosted deployment as `BLOCKED`, not `PASS`.

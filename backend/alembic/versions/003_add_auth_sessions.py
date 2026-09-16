"""Add revocable refresh-token sessions."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "003_add_auth_sessions"
down_revision = "002_add_reading_idempotency"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())
    if "auth_sessions" not in tables:
        op.create_table(
            "auth_sessions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
            sa.Column("session_id", sa.String(length=128), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("refresh_token_hash", sa.String(length=64), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("replaced_by", sa.String(length=128), nullable=True),
            sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
            sa.UniqueConstraint("session_id", name="uq_auth_sessions_session_id"),
            sa.UniqueConstraint("refresh_token_hash", name="uq_auth_sessions_refresh_token_hash"),
        )

    existing = {index["name"] for index in inspect(bind).get_indexes("auth_sessions")}
    for name, columns in (
        ("ix_auth_sessions_session_id", ["session_id"]),
        ("ix_auth_sessions_user_id", ["user_id"]),
        ("ix_auth_sessions_refresh_token_hash", ["refresh_token_hash"]),
        ("ix_auth_sessions_expires_at", ["expires_at"]),
        ("ix_auth_sessions_revoked_at", ["revoked_at"]),
    ):
        if name not in existing:
            op.create_index(name, "auth_sessions", columns)


def downgrade() -> None:
    bind = op.get_bind()
    if "auth_sessions" not in inspect(bind).get_table_names():
        return
    for name in (
        "ix_auth_sessions_revoked_at",
        "ix_auth_sessions_expires_at",
        "ix_auth_sessions_refresh_token_hash",
        "ix_auth_sessions_user_id",
        "ix_auth_sessions_session_id",
    ):
        if name in {index["name"] for index in inspect(bind).get_indexes("auth_sessions")}:
            op.drop_index(name, table_name="auth_sessions")
    op.drop_table("auth_sessions")

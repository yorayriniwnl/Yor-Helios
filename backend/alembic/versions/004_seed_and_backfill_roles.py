"""Provision known roles and backfill users without an assigned role."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "004_seed_and_backfill_roles"
down_revision = "003_add_auth_sessions"
branch_labels = None
depends_on = None

ROLE_NAMES = ("admin", "operator", "inspector", "viewer")
ROLE_ALIASES = {"administrator": "admin"}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())
    if "roles" not in tables or "users" not in tables:
        return

    roles = sa.table(
        "roles",
        sa.column("id", sa.Integer),
        sa.column("name", sa.String),
    )
    users = sa.table(
        "users",
        sa.column("id", sa.Integer),
        sa.column("role_id", sa.Integer),
    )

    rows = list(bind.execute(sa.select(roles.c.id, roles.c.name)).mappings())
    canonical_ids = {}
    for row in rows:
        role_id = int(row["id"])
        normalized = str(row["name"] or "").strip().lower() or "viewer"
        normalized = ROLE_ALIASES.get(normalized, normalized)
        canonical_id = canonical_ids.get(normalized)
        if canonical_id is None:
            bind.execute(roles.update().where(roles.c.id == role_id).values(name=normalized))
            canonical_ids[normalized] = role_id
            continue

        bind.execute(users.update().where(users.c.role_id == role_id).values(role_id=canonical_id))
        bind.execute(roles.delete().where(roles.c.id == role_id))

    for role_name in ROLE_NAMES:
        if role_name not in canonical_ids:
            bind.execute(roles.insert().values(name=role_name))
            role_id = bind.execute(
                sa.select(roles.c.id).where(roles.c.name == role_name)
            ).scalar_one()
            canonical_ids[role_name] = int(role_id)

    bind.execute(
        users.update()
        .where(users.c.role_id.is_(None))
        .values(role_id=canonical_ids["viewer"])
    )

    index_names = {index["name"] for index in inspect(bind).get_indexes("roles")}
    if "uq_roles_name" not in index_names:
        op.create_index("uq_roles_name", "roles", ["name"], unique=True)


def downgrade() -> None:
    bind = op.get_bind()
    if "roles" not in inspect(bind).get_table_names():
        return
    if "uq_roles_name" in {index["name"] for index in inspect(bind).get_indexes("roles")}:
        op.drop_index("uq_roles_name", table_name="roles")

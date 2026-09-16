import importlib

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import Column, ForeignKey, Integer, MetaData, String, Table, create_engine, inspect, select

from backend.app.models.role import Role
from backend.app.models.user import User
from backend.app.services.role_service import (
    DEMO_ROLE_BY_EMAIL,
    backfill_null_roles,
    ensure_default_roles,
)


def test_null_role_users_are_backfilled_as_viewers(db):
    user = User(
        name="Unassigned User",
        email="unassigned@example.com",
        password_hash="hashed-password",
        is_active=True,
    )
    db.add(user)
    db.commit()

    roles = ensure_default_roles(db)
    assert roles["viewer"].name == "viewer"
    assert backfill_null_roles(db) == 1

    db.refresh(user)
    assert user.role.name == "viewer"


def test_demo_roles_are_explicit():
    assert DEMO_ROLE_BY_EMAIL == {
        "admin@example.com": "admin",
        "alice@example.com": "inspector",
        "bob@example.com": "inspector",
        "carol@example.com": "operator",
    }


def test_role_migration_normalizes_duplicates_and_preserves_assignments():
    migration = importlib.import_module("backend.alembic.versions.004_seed_and_backfill_roles")

    engine = create_engine("sqlite:///:memory:")
    metadata = MetaData()
    roles = Table(
        "roles",
        metadata,
        Column("id", Integer, primary_key=True),
        Column("name", String(50), nullable=False),
    )
    users = Table(
        "users",
        metadata,
        Column("id", Integer, primary_key=True),
        Column("role_id", Integer, ForeignKey("roles.id"), nullable=True),
    )
    metadata.create_all(engine)

    with engine.begin() as connection:
        connection.execute(roles.insert(), [{"name": "ADMIN"}, {"name": "administrator"}, {"name": "Viewer"}])
        connection.execute(users.insert(), [{"role_id": 2}, {"role_id": 3}, {"role_id": None}])
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()

        role_rows = connection.execute(select(roles.c.id, roles.c.name)).all()
        user_rows = connection.execute(select(users.c.role_id)).all()
        index_names = {item["name"] for item in inspect(connection).get_indexes("roles")}

    assert {row.name for row in role_rows} == {"admin", "operator", "inspector", "viewer"}
    viewer_id = next(row.id for row in role_rows if row.name == "viewer")
    admin_id = next(row.id for row in role_rows if row.name == "admin")
    assert user_rows == [(admin_id,), (viewer_id,), (viewer_id,)]
    assert "uq_roles_name" in index_names

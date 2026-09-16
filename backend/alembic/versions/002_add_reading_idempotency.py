"""Add an optional idempotency key to telemetry ingestion."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "002_add_reading_idempotency"
down_revision = "001_add_meter_coords"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("readings")}
    if "ingest_key" not in columns:
        op.add_column("readings", sa.Column("ingest_key", sa.String(length=128), nullable=True))

    index_names = {index["name"] for index in inspect(bind).get_indexes("readings")}
    if "ix_readings_ingest_key" not in index_names:
        op.create_index("ix_readings_ingest_key", "readings", ["ingest_key"], unique=True)


def downgrade() -> None:
    bind = op.get_bind()
    if "ix_readings_ingest_key" in {index["name"] for index in inspect(bind).get_indexes("readings")}:
        op.drop_index("ix_readings_ingest_key", table_name="readings")
    if "ingest_key" in {column["name"] for column in inspect(bind).get_columns("readings")}:
        with op.batch_alter_table("readings") as batch_op:
            batch_op.drop_column("ingest_key")

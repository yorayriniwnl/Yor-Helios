"""Add latitude and longitude columns to meters table.

Revision ID: 001_add_meter_coords
Revises: 
Create Date: 2026-04-09
"""
from alembic import op
import sqlalchemy as sa

revision = "001_add_meter_coords"
down_revision = "000_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Use batch_alter_table for SQLite compatibility (SQLite doesn't support
    # ADD COLUMN with certain constraints natively; batch mode uses copy).
    with op.batch_alter_table("meters") as batch_op:
        batch_op.add_column(sa.Column("latitude",  sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("longitude", sa.Float(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("meters") as batch_op:
        batch_op.drop_column("longitude")
        batch_op.drop_column("latitude")

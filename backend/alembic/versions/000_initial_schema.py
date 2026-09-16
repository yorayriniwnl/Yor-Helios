"""Create the baseline Helios schema.

The original application created tables with ``Base.metadata.create_all`` and
therefore shipped an SQLite database without an Alembic version. This
revision is intentionally conditional so it can adopt that database without
dropping its data, while still making a brand-new database fully migratable.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "000_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def _create_if_missing(name: str, *columns, **kwargs) -> None:
    bind = op.get_bind()
    if name not in inspect(bind).get_table_names():
        op.create_table(name, *columns, **kwargs)


def upgrade() -> None:
    timestamp = sa.text("CURRENT_TIMESTAMP")

    _create_if_missing(
        "roles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=timestamp, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=timestamp, nullable=False),
        sa.Column("name", sa.String(length=50), nullable=False),
    )
    _create_if_missing(
        "zones",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=timestamp, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=timestamp, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("city", sa.String(length=255), nullable=True),
        sa.Column("state", sa.String(length=100), nullable=True),
    )
    _create_if_missing(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=timestamp, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=timestamp, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("role_id", sa.Integer(), sa.ForeignKey("roles.id"), nullable=True),
    )
    _create_if_missing(
        "meters",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=timestamp, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=timestamp, nullable=False),
        sa.Column("meter_number", sa.String(length=100), nullable=False, unique=True),
        sa.Column("household_name", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="active"),
        sa.Column("zone_id", sa.Integer(), sa.ForeignKey("zones.id"), nullable=True),
    )
    _create_if_missing(
        "transformers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=timestamp, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=timestamp, nullable=False),
        sa.Column("zone_id", sa.Integer(), sa.ForeignKey("zones.id"), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("capacity", sa.Float(), nullable=True),
        sa.Column("load_percent", sa.Float(), nullable=True),
    )
    _create_if_missing(
        "readings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=timestamp, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=timestamp, nullable=False),
        sa.Column("meter_id", sa.Integer(), sa.ForeignKey("meters.id"), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("voltage", sa.Float(), nullable=True),
        sa.Column("current", sa.Float(), nullable=True),
        sa.Column("power_consumption", sa.Float(), nullable=True),
        sa.Index("ix_readings_meter_timestamp", "meter_id", "timestamp"),
        sa.Index("ix_readings_timestamp", "timestamp"),
    )
    _create_if_missing(
        "alerts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=timestamp, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=timestamp, nullable=False),
        sa.Column("meter_id", sa.Integer(), sa.ForeignKey("meters.id"), nullable=True),
        sa.Column("reading_id", sa.Integer(), sa.ForeignKey("readings.id"), nullable=True),
        sa.Column("type", sa.String(length=100), nullable=False),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("explanation", sa.String(length=1000), nullable=True),
        sa.Column("severity", sa.String(length=50), nullable=False, server_default="medium"),
        sa.Column("assigned_to", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="open"),
        sa.Column("resolution_notes", sa.String(length=2000), nullable=True),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sla_breached", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    _create_if_missing(
        "anomaly_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=timestamp, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=timestamp, nullable=False),
        sa.Column("meter_id", sa.Integer(), sa.ForeignKey("meters.id"), nullable=True),
        sa.Column("reading_id", sa.Integer(), sa.ForeignKey("readings.id"), nullable=True),
        sa.Column("type", sa.String(length=100), nullable=False),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("explanation", sa.String(length=1000), nullable=True),
    )
    _create_if_missing(
        "evidence",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=timestamp, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=timestamp, nullable=False),
        sa.Column("alert_id", sa.Integer(), sa.ForeignKey("alerts.id"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("file_path", sa.String(length=1000), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=True),
        sa.Column("gps_lat", sa.Float(), nullable=True),
        sa.Column("gps_lon", sa.Float(), nullable=True),
        sa.Column("evidence_ts", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.String(length=2000), nullable=True),
        sa.Column("before_after", sa.String(length=20), nullable=True),
    )
    _create_if_missing(
        "zone_analytics",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=timestamp, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=timestamp, nullable=False),
        sa.Column("zone_id", sa.Integer(), sa.ForeignKey("zones.id"), nullable=False),
        sa.Column("window_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("window_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("total_input", sa.Float(), nullable=True),
        sa.Column("total_consumption", sa.Float(), nullable=True),
        sa.Column("loss_percentage", sa.Float(), nullable=True),
        sa.Index("ix_zone_analytics_zone_created", "zone_id", "created_at"),
    )
    _create_if_missing(
        "audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=timestamp, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=timestamp, nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("action", sa.String(length=255), nullable=False),
        sa.Column("entity", sa.String(length=255), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=True),
        sa.Column("metadata", sa.String(length=2000), nullable=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), server_default=timestamp, nullable=False),
    )
    _create_if_missing(
        "processed_actions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=timestamp, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=timestamp, nullable=False),
        sa.Column("action_id", sa.String(length=128), nullable=False, unique=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("method", sa.String(length=16), nullable=False),
        sa.Column("url", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="applied"),
        sa.Column("result_json", sa.String(length=2000), nullable=True),
        sa.Column("processed_at", sa.DateTime(timezone=True), server_default=timestamp, nullable=False),
    )

    # These indexes are additive and use stable names. Existing databases
    # created by SQLAlchemy already have most of them; only create missing
    # ones so adoption remains non-destructive.
    bind = op.get_bind()
    existing = {index["name"] for table in inspect(bind).get_table_names() for index in inspect(bind).get_indexes(table)}
    for table, name, columns in (
        ("roles", "ix_roles_name", ["name"]),
        ("zones", "ix_zones_name", ["name"]),
        ("users", "ix_users_email", ["email"]),
        ("meters", "ix_meters_meter_number", ["meter_number"]),
        ("meters", "ix_meters_zone_id", ["zone_id"]),
        ("readings", "ix_readings_meter_id", ["meter_id"]),
        ("alerts", "ix_alerts_meter_id", ["meter_id"]),
        ("alerts", "ix_alerts_reading_id", ["reading_id"]),
        ("alerts", "ix_alerts_severity", ["severity"]),
        ("alerts", "ix_alerts_assigned_to", ["assigned_to"]),
        ("alerts", "ix_alerts_status", ["status"]),
        ("alerts", "ix_alerts_sla_breached", ["sla_breached"]),
        ("alerts", "ix_alerts_created_at", ["created_at"]),
        ("anomaly_events", "ix_anomaly_events_meter_id", ["meter_id"]),
        ("anomaly_events", "ix_anomaly_events_reading_id", ["reading_id"]),
        ("anomaly_events", "ix_anomaly_events_created_at", ["created_at"]),
        ("evidence", "ix_evidence_alert_id", ["alert_id"]),
        ("evidence", "ix_evidence_user_id", ["user_id"]),
        ("evidence", "ix_evidence_created_at", ["created_at"]),
        ("transformers", "ix_transformers_zone_id", ["zone_id"]),
        ("transformers", "ix_transformers_name", ["name"]),
        ("zone_analytics", "ix_zone_analytics_zone_id", ["zone_id"]),
        ("audit_logs", "ix_audit_logs_user_id", ["user_id"]),
        ("audit_logs", "ix_audit_logs_entity_id", ["entity_id"]),
        ("processed_actions", "ix_processed_actions_action_id", ["action_id"]),
        ("processed_actions", "ix_processed_actions_user_id", ["user_id"]),
        ("processed_actions", "ix_processed_actions_processed_at", ["processed_at"]),
    ):
        if name not in existing and table in inspect(bind).get_table_names():
            op.create_index(name, table, columns)


def downgrade() -> None:
    for table in (
        "processed_actions",
        "audit_logs",
        "zone_analytics",
        "evidence",
        "anomaly_events",
        "alerts",
        "readings",
        "transformers",
        "meters",
        "users",
        "zones",
        "roles",
    ):
        op.drop_table(table)

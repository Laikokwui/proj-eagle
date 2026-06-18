"""Initial schema

Revision ID: 0001
Revises:
Create Date: 2026-06-18

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(64), nullable=False, unique=True),
        sa.Column("email", sa.String(255), unique=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("role", sa.String(32), server_default="operator"),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_users_username", "users", ["username"])

    op.create_table(
        "cameras",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("rtsp_url", sa.String(512), nullable=False),
        sa.Column("location", sa.String(255)),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true()),
        sa.Column("is_streaming", sa.Boolean(), server_default=sa.false()),
        sa.Column("fps_limit", sa.SmallInteger(), server_default="5"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "ai_models",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("source", sa.String(32), nullable=False),
        sa.Column("model_id", sa.String(255), nullable=False),
        sa.Column("file_path", sa.String(512), nullable=False),
        sa.Column("class_names", JSON, nullable=False, server_default="[]"),
        sa.Column("ppe_class_ids", JSON, nullable=False, server_default="[]"),
        sa.Column("is_active", sa.Boolean(), server_default=sa.false()),
        sa.Column("file_size_mb", sa.Numeric(8, 2)),
        sa.Column("downloaded_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("source", "model_id", name="uq_ai_models_source_model_id"),
    )
    op.create_index("ix_ai_models_is_active", "ai_models", ["is_active"])

    op.create_table(
        "violations",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("camera_id", sa.Integer(), sa.ForeignKey("cameras.id", ondelete="SET NULL"), nullable=True),
        sa.Column("ai_model_id", sa.Integer(), sa.ForeignKey("ai_models.id", ondelete="SET NULL"), nullable=True),
        sa.Column("screenshot_path", sa.String(512)),
        sa.Column("missing_classes", JSON, nullable=False, server_default="[]"),
        sa.Column("detection_conf", sa.Numeric(5, 4)),
        sa.Column("acknowledged", sa.Boolean(), server_default=sa.false()),
        sa.Column("acknowledged_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_violations_camera_id", "violations", ["camera_id"])
    op.create_index("idx_violations_occurred_at", "violations", ["occurred_at"])


def downgrade() -> None:
    op.drop_table("violations")
    op.drop_table("ai_models")
    op.drop_table("cameras")
    op.drop_table("users")

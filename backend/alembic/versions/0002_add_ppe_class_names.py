"""add ppe_class_names to ai_models

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-19
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ai_models",
        sa.Column("ppe_class_names", postgresql.JSONB, server_default=sa.text("'[]'::jsonb"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("ai_models", "ppe_class_names")

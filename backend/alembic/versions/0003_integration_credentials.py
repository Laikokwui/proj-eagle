"""add integration credentials

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-19
"""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "integration_credentials",
        sa.Column("provider", sa.String(32), primary_key=True),
        sa.Column("encrypted_token", sa.Text(), nullable=False),
        sa.Column("token_hint", sa.String(64), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("integration_credentials")

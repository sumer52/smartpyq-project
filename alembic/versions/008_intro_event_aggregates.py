"""intro event aggregates (privacy-friendly, anonymous daily counters)

Revision ID: 008
Revises: 007
Create Date: 2026-09-29
"""

from alembic import op
import sqlalchemy as sa

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "intro_event_aggregates",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("event_type", sa.String(length=20), nullable=False),
        sa.Column("scene", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.String(length=40), nullable=True),
        sa.UniqueConstraint("day", "event_type", "scene", name="uq_intro_event_day"),
    )
    op.create_index("ix_intro_event_aggregates_id", "intro_event_aggregates", ["id"])
    op.create_index("ix_intro_event_aggregates_day", "intro_event_aggregates", ["day"])


def downgrade() -> None:
    op.drop_index("ix_intro_event_aggregates_day", table_name="intro_event_aggregates")
    op.drop_index("ix_intro_event_aggregates_id", table_name="intro_event_aggregates")
    op.drop_table("intro_event_aggregates")

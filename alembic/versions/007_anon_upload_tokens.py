"""Add papers.anon_token for signed-out community uploads.

Community submissions no longer require an account. Each anonymous upload
gets a random token stored on the paper and mirrored in the uploader's
browser, so they can still list their own submissions without a login.

Revision ID: 007
Revises: 006
Create Date: 2026-09-17
"""

from alembic import op
import sqlalchemy as sa

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = {c["name"] for c in inspector.get_columns("papers")}
    if "anon_token" not in columns:
        op.add_column("papers", sa.Column("anon_token", sa.String(64), nullable=True))
        op.create_index("ix_papers_anon_token", "papers", ["anon_token"])


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = {c["name"] for c in inspector.get_columns("papers")}
    if "anon_token" in columns:
        op.drop_index("ix_papers_anon_token", table_name="papers")
        op.drop_column("papers", "anon_token")

"""Drop legacy paper_versions.file_url.

The PaperVersion model does not declare ``file_url`` (the storage key lives in
``s3_key``), but migration 001 created it NOT NULL. Every version insert
therefore fails with an IntegrityError on migrated databases while passing on
model-created test schemas. Dropping the dead column re-aligns the schema with
the model.

Revision ID: 006
Revises: 005
Create Date: 2026-09-11
"""

from alembic import op
import sqlalchemy as sa

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if "paper_versions" not in inspector.get_table_names():
        return
    columns = {c["name"] for c in inspector.get_columns("paper_versions")}
    if "file_url" not in columns:
        return
    # batch_alter_table works on both SQLite and Postgres.
    with op.batch_alter_table("paper_versions") as batch:
        batch.drop_column("file_url")


def downgrade() -> None:
    with op.batch_alter_table("paper_versions") as batch:
        batch.add_column(sa.Column("file_url", sa.String(length=1000), nullable=True))

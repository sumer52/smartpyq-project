"""Add teacher answer fields to questions.

Revision ID: 005
Revises: 004
Create Date: 2026-09-10

Adds the Exam Practice Mode answer system: each extracted question can carry
an optional teacher answer stored in its original format (text / image / pdf).
All columns are nullable so existing rows and tests are unaffected.
"""

from alembic import op
import sqlalchemy as sa

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None

ANSWER_COLUMNS = [
    ("answer_type", sa.String(length=20), None),
    ("answer_text", sa.Text(), None),
    ("answer_file_url", sa.String(length=1000), None),
    ("answer_file_name", sa.String(length=255), None),
    ("answer_file_size", sa.Integer(), None),
    ("answer_file_mime", sa.String(length=100), None),
    ("answer_updated_at", sa.DateTime(timezone=True), None),
    ("answer_updated_by", sa.Integer(), None),  # FK added below (users.id)
]


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "questions" not in inspector.get_table_names():
        return  # nothing to alter

    existing = {c["name"] for c in inspector.get_columns("questions")}
    for name, coltype, _default in ANSWER_COLUMNS:
        if name in existing:
            continue  # idempotent: inspect-before-add, like 004
        op.add_column("questions", sa.Column(name, coltype, nullable=True))

    # FK is added separately so this works on both SQLite (legacy) and Postgres.
    if "answer_updated_by" not in existing:
        try:
            op.create_foreign_key(
                "fk_questions_answer_updated_by_users",
                "questions", "users",
                ["answer_updated_by"], ["id"],
            )
        except Exception:
            # SQLite's ALTER limitations can reject FK-only DDL depending on
            # dialect config; the column itself is what matters at runtime.
            pass


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "questions" not in inspector.get_table_names():
        return
    existing = {c["name"] for c in inspector.get_columns("questions")}
    for name, _coltype, _default in reversed(ANSWER_COLUMNS):
        if name in existing:
            op.drop_column("questions", name)

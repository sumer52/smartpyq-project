"""Add performance indexes: compound filter indexes and pg_trgm GIN for ILIKE.

Revision ID: 003
Revises: 002
Create Date: 2026-09-06 12:00:00.000000

Production repair note (2026-09-09):
Databases at revision 002 predate several Paper-model columns (specialization,
semester, file_name, extracted_text, processing_status, processing_error,
moderation_notes, max_marks, search_vector). Revision 003 previously failed
there because ix_papers_stream_specialization referenced a nonexistent
specialization column. This revision now reconciles the papers table to the
current Paper model BEFORE creating any index, using inspect-before-add so it
is safe on fresh databases, partially migrated databases, and re-runs.
"""
from alembic import op
import sqlalchemy as sa

revision = '003'
down_revision = '002'
branch_labels = None
depends_on = None

# Column name -> (column definition, data-copy source column or None)
# - Plain adds: new columns, NULL/default fill (no data to preserve).
# - Copied adds: renamed model fields; existing data is preserved by copying
#   from the old migration-only column (e.g. total_marks -> max_marks).
PAPER_COLUMNS = {
    'specialization': ("sa.String(length=255)", None),          # needed by ix_papers_stream_specialization
    'semester': ("sa.String(length=50)", None),
    'max_marks': ("sa.Integer", 'total_marks'),                 # renamed from total_marks; copy data
    'file_name': ("sa.String(length=255)", None),
    'extracted_text': ("sa.Text", None),
    'processing_status': ("sa.String(length=50)", None),        # model default 'uploaded', filled below
    'processing_error': ("sa.Text", None),
    'moderation_notes': ("sa.Text", 'rejection_reason'),        # renamed from rejection_reason; copy data
    'search_vector': ("sa.Text", None),
}

TRGM_COLUMNS = ('subject', 'university', 'stream', 'specialization', 'title')


def _is_postgres() -> bool:
    return op.get_bind().dialect.name == 'postgresql'


def upgrade() -> None:
    """Reconcile papers schema with the Paper model, then add performance indexes."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_cols = {c['name'] for c in inspector.get_columns('papers')}

    # ------------------------------------------------------------------
    # 1. Add missing model columns BEFORE creating any index that needs them.
    #    Renamed fields copy their data from the legacy column.
    # ------------------------------------------------------------------
    for name, (coldef, copy_from) in PAPER_COLUMNS.items():
        if name in existing_cols:
            continue
        col = eval(coldef, {'sa': sa})
        op.add_column('papers', sa.Column(name, col, nullable=True))

    # Preserve data for renamed columns (only when the source column exists).
    refreshed = {c['name'] for c in sa.inspect(bind).get_columns('papers')}
    if 'total_marks' in refreshed and 'max_marks' not in existing_cols:
        op.execute('UPDATE papers SET max_marks = total_marks WHERE max_marks IS NULL')
    if 'rejection_reason' in refreshed and 'moderation_notes' not in existing_cols:
        op.execute('UPDATE papers SET moderation_notes = rejection_reason WHERE moderation_notes IS NULL')

    # Fill the processing pipeline default for pre-existing rows.
    refreshed = {c['name'] for c in sa.inspect(bind).get_columns('papers')}
    if 'processing_status' in refreshed and 'processing_status' not in existing_cols:
        op.execute("UPDATE papers SET processing_status = 'uploaded' WHERE processing_status IS NULL")

    # ------------------------------------------------------------------
    # 2. Idempotent compound indexes (create only if absent).
    # ------------------------------------------------------------------
    existing_indexes = {ix['name'] for ix in inspector.get_indexes('papers')}

    compound = [
        ('ix_papers_status_stream_created', ['status', 'stream', 'created_at']),
        ('ix_papers_status_year_created', ['status', 'year', 'created_at']),
        ('ix_papers_stream_specialization', ['stream', 'specialization']),
    ]
    for name, cols in compound:
        if name not in existing_indexes:
            op.create_index(name, 'papers', cols, unique=False)

    # ------------------------------------------------------------------
    # 3. PostgreSQL-only: pg_trgm GIN indexes for ILIKE '%term%' searches.
    #    Idempotent via CREATE INDEX IF NOT EXISTS; skipped on SQLite.
    # ------------------------------------------------------------------
    if _is_postgres():
        op.execute('CREATE EXTENSION IF NOT EXISTS pg_trgm')
        for col in TRGM_COLUMNS:
            safe = '"' + col.replace('"', '""') + '"'
            op.execute(
                f'CREATE INDEX IF NOT EXISTS ix_papers_{col}_trgm '
                f'ON papers USING gin ({safe} gin_trgm_ops)'
            )


def downgrade() -> None:
    """Remove the performance indexes added here.

    Reconciled business-data columns (specialization, semester, max_marks,
    moderation_notes, etc.) are intentionally NOT dropped: the current
    application model requires them, and dropping populated production
    columns on rollback would destroy data.
    """
    if _is_postgres():
        for col in TRGM_COLUMNS:
            op.execute(f'DROP INDEX IF EXISTS ix_papers_{col}_trgm')

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_indexes = {ix['name'] for ix in inspector.get_indexes('papers')}
    for name in ('ix_papers_stream_specialization', 'ix_papers_status_year_created', 'ix_papers_status_stream_created'):
        if name in existing_indexes:
            op.drop_index(name, table_name='papers')

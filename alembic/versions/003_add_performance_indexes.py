"""Add performance indexes: compound filter indexes and pg_trgm GIN for ILIKE.

Revision ID: 003
Revises: 002
Create Date: 2026-09-06 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '003'
down_revision = '002'
branch_labels = None
depends_on = None


def _is_postgres() -> bool:
    bind = op.get_bind()
    return bind.dialect.name == 'postgresql'


def upgrade() -> None:
    """Add performance indexes for common paper filter/search paths."""
    # Compound index: status + stream + created_at
    # Supports: browse with stream filter, ordered by recency
    op.create_index(
        'ix_papers_status_stream_created',
        'papers',
        ['status', 'stream', 'created_at'],
        unique=False,
    )

    # Compound index: status + year + created_at
    # Supports: browse with year filter, ordered by recency
    op.create_index(
        'ix_papers_status_year_created',
        'papers',
        ['status', 'year', 'created_at'],
        unique=False,
    )

    # Compound index: stream + specialization
    # Supports: stream/specialization filter combinations in listing and search
    op.create_index(
        'ix_papers_stream_specialization',
        'papers',
        ['stream', 'specialization'],
        unique=False,
    )

    # PostgreSQL-only: pg_trgm GIN indexes for ILIKE '%term%' searches.
    # Leading-wildcard ILIKE cannot use B-tree indexes; GIN + pg_trgm enables
    # index-assisted substring matching. Skipped on SQLite (dev) where the
    # dataset is small and scans are acceptable.
    if _is_postgres():
        op.execute('CREATE EXTENSION IF NOT EXISTS pg_trgm')
        for col in ('subject', 'university', 'stream', 'specialization', 'title'):
            op.execute(
                f'CREATE INDEX IF NOT EXISTS ix_papers_{col}_trgm '
                f'ON papers USING gin ({col} gin_trgm_ops)'
            )


def downgrade() -> None:
    """Remove performance indexes."""
    op.drop_index('ix_papers_stream_specialization', table_name='papers')
    op.drop_index('ix_papers_status_year_created', table_name='papers')
    op.drop_index('ix_papers_status_stream_created', table_name='papers')
    if _is_postgres():
        for col in ('subject', 'university', 'stream', 'specialization', 'title'):
            op.execute(f'DROP INDEX IF EXISTS ix_papers_{col}_trgm')

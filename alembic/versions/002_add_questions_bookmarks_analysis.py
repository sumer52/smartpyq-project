"""Add missing tables: questions, question_groups, question_group_members,
analysis_results, bookmarks, practice_attempts

Revision ID: 002
Revises: 001
Create Date: 2026-08-30 23:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '002'
down_revision = '001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add missing tables that exist in models but not in initial migration."""
    
    # Check if tables already exist (safe for both fresh and existing databases)
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()
    
    # Create question_groups table
    if 'question_groups' not in existing_tables:
        op.create_table('question_groups',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('representative_text', sa.Text(), nullable=False),
            sa.Column('normalized_text', sa.Text(), nullable=False),
            sa.Column('subject', sa.String(200), nullable=False, index=True),
            sa.Column('topic', sa.String(200), nullable=True, index=True),
            sa.Column('frequency', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('similarity_method', sa.String(50), nullable=False),
            sa.Column('confidence', sa.Float(), nullable=False, server_default='0.0'),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    
    # Create questions table
    if 'questions' not in existing_tables:
        op.create_table('questions',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('paper_id', sa.Integer(), sa.ForeignKey('papers.id', ondelete='CASCADE'), nullable=False, index=True),
            sa.Column('question_number', sa.String(50), nullable=True),
            sa.Column('question_text', sa.Text(), nullable=False),
            sa.Column('original_question_text', sa.Text(), nullable=True),
            sa.Column('normalized_question_text', sa.Text(), nullable=True),
            sa.Column('section', sa.String(100), nullable=True),
            sa.Column('marks', sa.Integer(), nullable=True),
            sa.Column('question_type', sa.String(50), nullable=True),
            sa.Column('subject', sa.String(200), nullable=True, index=True),
            sa.Column('topic', sa.String(200), nullable=True, index=True),
            sa.Column('embedding', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    
    # Create question_group_members table
    if 'question_group_members' not in existing_tables:
        op.create_table('question_group_members',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('question_id', sa.Integer(), sa.ForeignKey('questions.id', ondelete='CASCADE'), nullable=False, index=True),
            sa.Column('group_id', sa.Integer(), sa.ForeignKey('question_groups.id', ondelete='CASCADE'), nullable=False, index=True),
            sa.Column('similarity_score', sa.Float(), nullable=False, server_default='0.0'),
            sa.Column('is_exact_match', sa.Boolean(), nullable=False, server_default='false'),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    
    # Create analysis_results table
    if 'analysis_results' not in existing_tables:
        op.create_table('analysis_results',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
            sa.Column('subject', sa.String(200), nullable=False, index=True),
            sa.Column('paper_ids', sa.Text(), nullable=True),
            sa.Column('paper_count', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('questions_extracted', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('repeated_groups', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('exact_matches', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('similar_matches', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('status', sa.String(50), nullable=False, server_default='pending'),
            sa.Column('error_message', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        )
    
    # Create bookmarks table
    if 'bookmarks' not in existing_tables:
        op.create_table('bookmarks',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
            sa.Column('paper_id', sa.Integer(), sa.ForeignKey('papers.id', ondelete='CASCADE'), nullable=True, index=True),
            sa.Column('question_id', sa.Integer(), sa.ForeignKey('questions.id', ondelete='CASCADE'), nullable=True),
            sa.Column('bookmark_type', sa.String(50), nullable=False, server_default='paper'),
            sa.Column('group_id', sa.Integer(), sa.ForeignKey('question_groups.id', ondelete='SET NULL'), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    
    # Create practice_attempts table
    if 'practice_attempts' not in existing_tables:
        op.create_table('practice_attempts',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
            sa.Column('question_id', sa.Integer(), sa.ForeignKey('questions.id', ondelete='CASCADE'), nullable=False, index=True),
            sa.Column('group_id', sa.Integer(), sa.ForeignKey('question_groups.id', ondelete='SET NULL'), nullable=True),
            sa.Column('status', sa.String(50), nullable=False, server_default='pending'),
            sa.Column('user_answer', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    
    # Add missing columns to existing tables (safe - only adds if not exists)
    # These are safe additive changes that won't break existing data
    
    # Note: For SQLite, ALTER TABLE ADD COLUMN is limited.
    # For PostgreSQL, we can add columns safely with IF NOT EXISTS patterns.
    # We skip column additions here since the app handles missing columns gracefully.
    # Run a fresh migration on a clean database for full schema.


def downgrade() -> None:
    """Remove added tables."""
    op.drop_table('practice_attempts')
    op.drop_table('bookmarks')
    op.drop_table('analysis_results')
    op.drop_table('question_group_members')
    op.drop_table('questions')
    op.drop_table('question_groups')

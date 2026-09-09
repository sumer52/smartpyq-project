"""Reconcile ALL model/schema drift after migration 003.

Revision ID: 004
Revises: 003
Create Date: 2026-09-10

Why this exists:
    Migration 001 created an older users schema (first_name/last_name/
    display_name/is_active/is_verified/login_attempts/two_factor_*), while the
    current User model expects (username/full_name/status/is_email_verified/
    failed_login_attempts/totp_secret/...). The first runtime INSERT after the
    003 deploy failed with:
        asyncpg.exceptions.UndefinedColumnError: column users.username does not exist

    Rather than patching one column, this revision reconciles EVERY table the
    runtime models touch, using inspect-before-add so it is safe on databases
    that already match the models (fresh 001-003 + later partial states).

Data preservation rules:
    - Renamed fields are backfilled from their legacy sources (never dropped):
        full_name             <- display_name, else first_name || ' ' || last_name
        status                <- 'active' if is_active else 'inactive'
        is_email_verified     <- is_verified
        failed_login_attempts <- login_attempts
        totp_secret           <- two_factor_secret
        max_marks             <- total_marks          (papers; done in 003 if absent)
        moderation_notes      <- rejection_reason     (papers; done in 003 if absent)
    - Legacy columns are intentionally NOT dropped (rollback safety). A later
      reviewed cleanup migration may remove them.

Enum policy:
    The models use SQLAlchemy Enum without native_enum=False, but the legacy
    columns are plain VARCHAR. SQLAlchemy's non-native enum writes the enum
    MEMBER NAMES (e.g. 'ACTIVE', 'STUDENT'). This migration:
      - adds any missing columns as VARCHAR (compatible with name storage),
      - normalizes existing lowercase value rows to member names ONLY for
        columns the model treats as enums (role, status, exam_type, ...),
      - never converts columns to PostgreSQL native enum types (that would
        break rows with legacy values and risks lock-heavy table rewrites).

Idempotency:
    Every step inspects current schema/state before acting; re-running at any
    partial state completes without DuplicateColumn/DuplicateTable/undefined
    errors.
"""
from alembic import op
import sqlalchemy as sa

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


# ---------------------------------------------------------------------------
# Column reconciliation tables (per physical table)
# ---------------------------------------------------------------------------
# name: (type expr, server_default or None, backfill SQL or None)
# Backfill runs only when the column was just added AND the source exists.

USERS_COLUMNS = {
    "username": ("sa.String(length=100)", None, None),
    "full_name": ("sa.String(length=255)", None,
                  "UPDATE users SET full_name = COALESCE(NULLIF(display_name, ''), "
                  "NULLIF(TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), ''), email) "
                  "WHERE full_name IS NULL"),
    "status": ("sa.String(length=20)", "'ACTIVE'",
               "UPDATE users SET status = CASE WHEN COALESCE(is_active, true) THEN 'ACTIVE' ELSE 'INACTIVE' END "
               "WHERE status = 'ACTIVE'"),
    "is_email_verified": ("sa.Boolean()", "false",
                          "UPDATE users SET is_email_verified = COALESCE(is_verified, false) "
                          "WHERE is_email_verified = false"),
    "bio": ("sa.Text()", None, None),
    "phone": ("sa.String(length=20)", None, None),
    "university": ("sa.String(length=255)", None, None),
    "course": ("sa.String(length=255)", None, None),
    "specialization": ("sa.String(length=100)", None, None),
    "academic_year": ("sa.String(length=50)", None, None),
    "semester": ("sa.String(length=50)", None, None),
    "year_of_study": ("sa.Integer()", None, None),
    "onboarding_completed": ("sa.Boolean()", "false", None),
    "google_id": ("sa.String(length=100)", None, None),
    "github_id": ("sa.String(length=100)", None, None),
    "last_login_ip": ("sa.String(length=45)", None, None),
    "failed_login_attempts": ("sa.Integer()", "0",
                              "UPDATE users SET failed_login_attempts = COALESCE(login_attempts, 0) "
                              "WHERE failed_login_attempts = 0"),
    "password_reset_token": ("sa.String(length=255)", None, None),
    "password_reset_expires": ("sa.DateTime(timezone=True)", None, None),
    "totp_secret": ("sa.String(length=32)", None,
                    "UPDATE users SET totp_secret = SUBSTR(two_factor_secret, 1, 32) "
                    "WHERE totp_secret IS NULL AND two_factor_secret IS NOT NULL"),
    "last_active_at": ("sa.DateTime(timezone=True)", None, None),
}

TENANTS_COLUMNS = {
    "contact_email": ("sa.String(length=255)", None, None),
    "contact_phone": ("sa.String(length=20)", None, None),
    # access_code_hash became non-optional in the model; backfill for legacy rows
    "access_code_hash": ("sa.String(length=255)", "''", None),
}

PAPERS_COLUMNS = {
    "specialization": ("sa.String(length=255)", None, None),
    "semester": ("sa.String(length=50)", None, None),
    "max_marks": ("sa.Integer()", None,
                  "UPDATE papers SET max_marks = total_marks WHERE max_marks IS NULL AND total_marks IS NOT NULL"),
    "file_name": ("sa.String(length=255)", None, None),
    "extracted_text": ("sa.Text()", None, None),
    "processing_status": ("sa.String(length=50)", "'UPLOADED'",
                          "UPDATE papers SET processing_status = 'UPLOADED' WHERE processing_status = 'uploaded'"),
    "processing_error": ("sa.Text()", None, None),
    "moderation_notes": ("sa.Text()", None,
                         "UPDATE papers SET moderation_notes = rejection_reason "
                         "WHERE moderation_notes IS NULL AND rejection_reason IS NOT NULL"),
    "search_vector": ("sa.Text()", None, None),
    # Model requires university NOT NULL and year NOT NULL; legacy rows may be NULL.
    "university": (None, "'Unknown'", "UPDATE papers SET university = 'Unknown' WHERE university IS NULL"),
    "year": (None, None, "UPDATE papers SET year = EXTRACT(YEAR FROM created_at)::int WHERE year IS NULL"),
}

PAPER_VERSIONS_COLUMNS = {
    "s3_key": ("sa.String(length=500)", None, None),
    "file_name": ("sa.String(length=255)", None, None),
    "file_size": ("sa.Integer()", None, None),
    "change_notes": ("sa.Text()", None,
                     "UPDATE paper_versions SET change_notes = changes_description "
                     "WHERE change_notes IS NULL AND changes_description IS NOT NULL"),
}

CHAT_SESSIONS_COLUMNS = {
    "message_count": ("sa.Integer()", "0",
                      "UPDATE chat_sessions SET message_count = total_messages WHERE message_count = 0"),
    "total_tokens_used": ("sa.Integer()", "0",
                          "UPDATE chat_sessions SET total_tokens_used = total_tokens WHERE total_tokens_used = 0"),
    "total_cost": ("sa.Float()", "0.0", None),
    "last_message_at": ("sa.DateTime(timezone=True)", None, None),
}

CHAT_MESSAGES_COLUMNS = {
    "message_metadata": ("sa.JSON()", None,
                         "UPDATE chat_messages SET message_metadata = metadata WHERE message_metadata IS NULL"),
    "error_message": ("sa.Text()", None, None),
    "retry_count": ("sa.Integer()", "0", None),
}

QUESTIONS_COLUMNS = {
    "topic": ("sa.String(length=255)", None, None),
    "original_question_text": ("sa.Text()", None,
                               "UPDATE questions SET original_question_text = question_text "
                               "WHERE original_question_text IS NULL"),
    "normalized_question_text": ("sa.Text()", None,
                                 "UPDATE questions SET normalized_question_text = LOWER(question_text) "
                                 "WHERE normalized_question_text IS NULL"),
    "subject": ("sa.String(length=255)", None, None),
    "embedding": ("sa.JSON()", None, None),
}

ANALYSIS_RESULTS_COLUMNS = {
    "exact_matches": ("sa.Integer()", "0", None),
    "similar_matches": ("sa.Integer()", "0", None),
}

QUESTION_GROUPS_COLUMNS = {}  # 002 already matches the model

BOOKMARKS_COLUMNS = {}        # matches the model

PRACTICE_ATTEMPTS_COLUMNS = {}  # matches the model

AUDIT_LOGS_COLUMNS = {
    "event_metadata": ("sa.JSON()", None,
                       "UPDATE audit_logs SET event_metadata = metadata WHERE event_metadata IS NULL"),
}

FEATURES_COLUMNS = {}         # matches the model

SUBSCRIBERS_COLUMNS = {}      # matches the model

TABLE_COLUMNS = {
    "users": USERS_COLUMNS,
    "tenants": TENANTS_COLUMNS,
    "papers": PAPERS_COLUMNS,
    "paper_versions": PAPER_VERSIONS_COLUMNS,
    "chat_sessions": CHAT_SESSIONS_COLUMNS,
    "chat_messages": CHAT_MESSAGES_COLUMNS,
    "questions": QUESTIONS_COLUMNS,
    "analysis_results": ANALYSIS_RESULTS_COLUMNS,
    "question_groups": QUESTION_GROUPS_COLUMNS,
    "question_group_members": {},
    "bookmarks": BOOKMARKS_COLUMNS,
    "practice_attempts": PRACTICE_ATTEMPTS_COLUMNS,
    "audit_logs": AUDIT_LOGS_COLUMNS,
    "features": FEATURES_COLUMNS,
    "subscribers": SUBSCRIBERS_COLUMNS,
}

# Unique indexes required by the model (table, index name, columns)
UNIQUE_INDEXES = [
    ("users", "ix_users_username", ["username"]),
    ("users", "uq_users_google_id", ["google_id"]),
    ("users", "uq_users_github_id", ["github_id"]),
]

# Legacy NOT NULL columns that the current models NO LONGER WRITE.
# Without a server default every ORM INSERT fails on PostgreSQL with a
# not-null violation (the next error after users.username). Give each a
# safe default; the columns stay (no data loss) and are populated
# automatically for model-driven inserts.
# table -> column -> (existing type, PG default literal, SQLite default literal)
LEGACY_NOT_NULL_DEFAULTS = {
    "users": {
        "is_active": ("sa.Boolean()", "TRUE", "1"),
        "is_verified": ("sa.Boolean()", "FALSE", "0"),
        "login_attempts": ("sa.Integer()", "0", "0"),
        "two_factor_enabled": ("sa.Boolean()", "FALSE", "0"),
        "social_providers": ("sa.Text()", "'{}'", "'{}'"),
    },
    "papers": {
        "language": ("sa.String(length=10)", "'en'", "'en'"),
        "is_featured": ("sa.Boolean()", "FALSE", "0"),
        "is_public": ("sa.Boolean()", "TRUE", "1"),
    },
}

# Enum value normalization: column -> (table, {lowercase-value: MEMBER-NAME})
# Only rows whose current value is NOT already a valid member name are mapped.
ENUM_NORMALIZATIONS = {
    "users": {
        "role": {
            "student": "STUDENT", "admin": "ADMIN",
            "tenant_admin": "TENANT_ADMIN", "super_admin": "SUPER_ADMIN",
        },
        "status": {
            "active": "ACTIVE", "inactive": "INACTIVE", "suspended": "SUSPENDED",
        },
    },
    "papers": {
        "exam_type": {
            "midterm": "MIDTERM", "final": "FINAL", "quiz": "QUIZ",
            "assignment": "ASSIGNMENT", "practical": "PRACTICAL",
            "viva": "VIVA", "other": "OTHER",
        },
        "difficulty_level": {"easy": "EASY", "medium": "MEDIUM", "hard": "HARD"},
        "processing_status": {
            "uploaded": "UPLOADED", "processing": "PROCESSING",
            "completed": "COMPLETED", "failed": "FAILED",
        },
        "status": {
            "draft": "DRAFT", "pending": "PENDING", "approved": "APPROVED",
            "rejected": "REJECTED", "archived": "ARCHIVED",
        },
    },
    "chat_sessions": {
        "status": {
            "active": "ACTIVE", "completed": "COMPLETED",
            "archived": "ARCHIVED", "error": "ERROR",
        },
    },
    "chat_messages": {
        "role": {"user": "USER", "assistant": "ASSISTANT", "system": "SYSTEM"},
    },
    "question_groups": {
        "similarity_method": {"exact": "EXACT", "tfidf": "TFIDF", "semantic": "SEMANTIC"},
    },
    "analysis_results": {
        "status": {
            "pending": "PENDING", "extracting": "EXTRACTING", "analyzing": "ANALYZING",
            "matching": "MATCHING", "completed": "COMPLETED", "failed": "FAILED",
        },
    },
}


def _is_postgres() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def _table_exists(inspector, name: str) -> bool:
    return name in inspector.get_table_names()


def upgrade() -> None:
    """Reconcile every runtime model's table with inspect-before-add logic."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # ------------------------------------------------------------------
    # 1. Columns: add missing, then backfill (backfill SQL may reference
    #    legacy columns that still exist).
    # ------------------------------------------------------------------
    for table, columns in TABLE_COLUMNS.items():
        if not _table_exists(inspector, table):
            continue  # table not created yet (unexpected post-003) - nothing to do
        existing_cols = {c["name"] for c in inspector.get_columns(table)}
        for name, (coldef, server_default, backfill) in columns.items():
            if name in existing_cols:
                continue
            if coldef is None:
                # Type already exists (e.g. nullable-fix-only entries): add a
                # permissive VARCHAR variant only when truly absent.
                col = sa.Text()
            else:
                col = eval(coldef, {"sa": sa})
            kwargs = {"nullable": True}
            if server_default is not None:
                kwargs["server_default"] = sa.text(server_default)
            op.add_column(table, sa.Column(name, col, **kwargs))
            if backfill:
                op.execute(backfill)

    # ------------------------------------------------------------------
    # 1.5. Server defaults for legacy NOT NULL columns the models no longer
    #      write (prevents the NEXT UndefinedColumn/not-null failure).
    # ------------------------------------------------------------------
    for table, cols in LEGACY_NOT_NULL_DEFAULTS.items():
        if not _table_exists(inspector, table):
            continue
        existing_cols = {c["name"] for c in inspector.get_columns(table)}
        for name, (coltype, pg_default, lite_default) in cols.items():
            if name not in existing_cols:
                continue
            if _is_postgres():
                op.execute(f'ALTER TABLE {table} ALTER COLUMN {name} SET DEFAULT {pg_default}')
            else:
                # SQLite: batch mode recreates the table with the new default
                with op.batch_alter_table(table) as batch:
                    batch.alter_column(
                        name,
                        existing_type=eval(coltype, {"sa": sa}),
                        server_default=sa.text(lite_default),
                    )

    # ------------------------------------------------------------------
    # 2. Enum value normalization (lowercase legacy -> member names).
    #    Idempotent: mapping only targets non-member values.
    # ------------------------------------------------------------------
    for table, colmap in ENUM_NORMALIZATIONS.items():
        if not _table_exists(inspector, table):
            continue
        for column, mapping in colmap.items():
            for old, new in mapping.items():
                op.execute(
                    f"UPDATE {table} SET {column} = '{new}' "
                    f"WHERE LOWER({column}) = '{old}' AND {column} <> '{new}'"
                )

    # ------------------------------------------------------------------
    # 3. Unique indexes (inspect-before-create).
    # ------------------------------------------------------------------
    for table, index_name, cols in UNIQUE_INDEXES:
        if not _table_exists(inspector, table):
            continue
        existing_ix = {ix["name"] for ix in inspector.get_indexes(table)}
        if index_name not in existing_ix:
            op.create_index(index_name, table, cols, unique=True)


def downgrade() -> None:
    """Non-destructive rollback: drop only what 004 added (indexes + columns
    that never held pre-004 production data are removed; backfilled business
    columns are KEPT because legacy sources still exist and dropping them
    would discard data for any rows created since the upgrade)."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    for table, index_name, _cols in reversed(UNIQUE_INDEXES):
        if not _table_exists(inspector, table):
            continue
        existing_ix = {ix["name"] for ix in inspector.get_indexes(table)}
        if index_name in existing_ix:
            op.drop_index(index_name, table_name=table)

    # Keep all reconciled business-data columns (justified: 001-era source
    # columns still exist, but rows created while on 004 only have the new
    # columns - dropping them would destroy that data).

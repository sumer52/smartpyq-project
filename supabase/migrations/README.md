# Supabase migrations (LEGACY — UNUSED)

The SQL files in this directory are the **legacy Supabase database schema** from
an earlier architecture. They are **not used** by the deployed application:

- The application database is **PostgreSQL on Render**, managed exclusively by
  **Alembic** migrations (`alembic/versions/`).
- Supabase is used **only for private file storage** (the `question-papers`
  bucket). No Supabase database, auth, or RLS features are used at runtime.

Do not run these files against any database. They are kept only for historical
reference and may be removed in a future cleanup.

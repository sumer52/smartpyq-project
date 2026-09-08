# SmartPYQ Deployment Guide

## Production: Render native Python runtime

The backend is FastAPI and runs directly with Uvicorn. The React/Vite frontend remains a separate static deployment; its code and build configuration are unchanged.

See [the Render setup guide](../DEPLOY_BACKEND.md) for dashboard instructions, including updating an existing service without replacing its database.

| Setting | Value |
|---------|-------|
| Runtime | Python |
| Root directory | Repository root (leave blank) |
| Python version | 3.12, selected by `.python-version` |
| Build command | `python -m pip install -r requirements.txt && python -m alembic upgrade head` |
| Start command | `python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Health check | `/health` |

All Python dependencies are declared in `requirements.txt`. Render supplies `PORT` and terminates HTTPS; no additional reverse proxy is required. The existing Alembic migrations run during the build and require access to the configured database. Back up production data before deploying migrations, and avoid concurrent deployments against the same database.

## Environment variables

Set production configuration in the Render web service's **Environment** tab. Do not upload or commit a production `.env` file. Local `.env` values never override environment variables already supplied by the host.

| Variable | Production value |
|----------|------------------|
| `ENV` | `production` |
| `DEBUG` | `false` |
| `DATABASE_URL` | Keep your existing PostgreSQL URL; use the internal URL for a database on Render in the same region |
| `JWT_SECRET` | Keep your existing strong signing secret (at least 32 characters) |
| `ALLOWED_HOSTS` | Your exact backend hostname, or `*.onrender.com`; add custom backend domains as comma-separated hostnames |
| `ALLOWED_ORIGINS`, `CORS_ORIGINS` | Exact frontend HTTPS origins, comma-separated, without trailing slashes |
| `DEV_EMAIL_LOG_OTP` | `false` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_USE_TLS`, `FROM_EMAIL`, `FROM_NAME` | Existing email configuration for OTP delivery |
| `FRONTEND_URL` | Existing frontend HTTPS origin |
| `GEMINI_API_KEY` or `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` | Existing AI provider settings |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, `USE_SUPABASE_STORAGE` | Existing storage settings when using Supabase |
| `STORAGE_BACKEND` and provider-specific variables | Preserve these when using another existing storage backend |
| `LOCAL_STORAGE_PATH`, `LOCAL_STORAGE_URL` | For local storage, use a Render persistent disk path and the public backend file URL |
| `REDIS_URL`, `CELERY_BROKER_URL` | Existing managed Redis connections when enabled |
| `SENTRY_DSN` | Existing error tracking configuration, when enabled |
| `LOG_LEVEL`, `LOG_FORMAT` | `INFO`, `json` |

See `.env.example` and `app/core/config.py` for other existing settings. Keep all backend credentials out of frontend environment variables.

## Local development

Use Python 3.12 and an isolated virtual environment:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env
# Set local values in .env before applying migrations.
python -m alembic upgrade head
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Use `.venv\Scripts\activate` on Windows. SQLite remains available for local development; production continues to use PostgreSQL.

## Existing optional capabilities

- **Storage:** Render's ordinary filesystem is ephemeral. Keep the existing external storage provider or attach a persistent disk before relying on local uploads. A persistent disk requires a compatible paid service plan.
- **Email:** Verify that the selected Render plan permits outbound SMTP on the configured port. Do not enable development OTP logging in production as a substitute for delivery.
- **OCR:** `pytesseract` is a Python wrapper, not the Tesseract executable. Scanned-document OCR requires `tesseract` and its language data on the runtime's `PATH`. Verify this on the native runtime before relying on OCR; text-based PDF extraction uses the installed Python libraries. The existing OCR/fallback logic is unchanged.
- **Virus scanning:** If using the existing command-line scanner, its executable must also be available on the native runtime. Python package installation does not install OS executables.
- **Background jobs:** Preserve any separately deployed Celery workers and their environment variables. They use the same Python runtime and `requirements.txt`; the web service does not start a worker or Redis itself.

## Verification

After deployment:

```bash
curl https://your-backend.onrender.com/health
curl https://your-backend.onrender.com/ready
curl https://your-backend.onrender.com/version
```

`/health` confirms the process is running; `/ready` checks configured dependencies. `/docs` is intentionally disabled in production. Verify login/OTP, upload/download, analysis, and AI chat through the existing frontend.

## Rollback

Use the Render service's **Events** page to roll back to a previously successful deploy. Preserve the environment variables and database connection. Application rollback does not undo database migrations or restore uploaded files.

For a separately planned database rollback, take a backup first, check schema compatibility, and run the appropriate existing Alembic downgrade from a controlled environment with the same `DATABASE_URL`:

```bash
python -m alembic downgrade -1
```

See [the backup and restore guide](BACKUP_RESTORE.md) before restoring production data.

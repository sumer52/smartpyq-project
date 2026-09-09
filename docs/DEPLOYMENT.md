# SmartPYQ Deployment Guide

## Prerequisites

- Python 3.12+
- PostgreSQL (production)
- Redis (optional, for caching)
- Supabase account (for file storage)

## Manual Deployment

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your configuration
```

### 3. Database Setup

For PostgreSQL:
```bash
# Set DATABASE_URL in .env
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/smartpyq

# Run migrations
alembic upgrade head
```

For development (SQLite):
```bash
# Default - no setup needed
DATABASE_URL=sqlite+aiosqlite:///./smartpyq.db
```

### 4. Start the Application

```bash
# Development
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Production
uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 4
```

## Deploy on Render (Python Runtime)

The repo includes a `render.yaml` blueprint that deploys the backend with the
native **Python runtime** (no containers):

1. Render Dashboard → **New +** → **Blueprint** → pick this repository.
2. Render reads `render.yaml` and creates `smartpyq-backend` + `smartpyq-db`.
3. Set `ALLOWED_ORIGINS` / `CORS_ORIGINS` to your frontend URL (e.g. `https://smartpyq-project.vercel.app`).
4. Deploy. The start command runs migrations and seeds the demo account automatically.

Key settings (already in `render.yaml`):

| Setting | Value |
|---------|-------|
| Runtime | `python` |
| Python version | `3.12.7` (via `PYTHON_VERSION`) |
| Build command | `pip install --upgrade pip && pip install -r requirements.txt` |
| Start command | `alembic upgrade head && python -m app.scripts.seed_demo_user && uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1` |
| Health check | `/health` |

> Python is pinned to 3.12 because prebuilt wheels exist for every dependency
> (PyMuPDF, asyncpg, cryptography, Pillow, aiohttp). Newer Pythons force
> compiling PyMuPDF from C++ source and fail the build.

## Environment Variables

See `.env.example` for all available configuration options.

### Required for Production

| Variable | Description |
|----------|-------------|
| `ENV=production` | Environment mode |
| `JWT_SECRET` | Strong secret for JWT signing (min 32 chars) |
| `DATABASE_URL` | PostgreSQL connection string |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |

### Optional

| Variable | Description |
|----------|-------------|
| `REDIS_URL` | Redis for caching |
| `SENTRY_DSN` | Error tracking |
| `SMTP_*` | Email configuration |

## Health Checks

- `/health` - Liveness check (process is alive)
- `/ready` - Readiness check (dependencies reachable)
- `/version` - Build information

## Production Checklist

- [ ] Set strong `JWT_SECRET` (min 32 characters)
- [ ] Use PostgreSQL (not SQLite)
- [ ] Configure Supabase for file storage
- [ ] Set `ENV=production`
- [ ] Disable debug mode (`DEBUG=false`)
- [ ] Configure CORS for your domain
- [ ] Set up SSL/TLS termination
- [ ] Configure monitoring (Sentry, etc.)
- [ ] Set up database backups

## Rollback

### Application Rollback

```bash
# Checkout previous version
git checkout <previous-tag>

# Restart the service (Render: Manual Deploy → Deploy latest commit)
```

### Database Rollback

```bash
# Rollback last migration
alembic downgrade -1

# Or rollback to specific revision
alembic downgrade <revision-id>
```

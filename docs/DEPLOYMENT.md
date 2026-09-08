# SmartPYQ Deployment Guide

## Prerequisites

- Docker and Docker Compose
- PostgreSQL (if not using Docker)
- Redis (optional, for caching)
- Supabase account (for file storage)

## Quick Start with Docker

```bash
# 1. Clone the repository
git clone https://github.com/your-org/smartpyq.git
cd smartpyq

# 2. Create environment file
cp .env.example .env

# 3. Edit .env with your settings (at minimum set JWT_SECRET)
# Generate a strong secret:
# python -c "import secrets; print(secrets.token_urlsafe(64))"

# 4. Start all services
docker-compose up -d

# 5. Check health
curl http://localhost:8000/health
curl http://localhost:8000/ready
```

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
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

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
# Stop current version
docker-compose down

# Checkout previous version
git checkout <previous-tag>

# Rebuild and restart
docker-compose up -d --build
```

### Database Rollback

```bash
# Rollback last migration
alembic downgrade -1

# Or rollback to specific revision
alembic downgrade <revision-id>
```

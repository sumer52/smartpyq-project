# SmartPYQ Architecture

## Overview

SmartPYQ is a full-stack web application for managing Previous Year Question (PYQ) papers with AI-powered features.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │   Web App    │  │  Mobile App │  │  Admin UI   │            │
│  │   (React)    │  │  (Future)   │  │  (Future)   │            │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘            │
│         │                │                │                     │
└─────────┼────────────────┼────────────────┼─────────────────────┘
          │                │                │
          ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         API GATEWAY                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    FastAPI (ASGI)                        │   │
│  │  • Rate Limiting (SlowAPI)                               │   │
│  │  • CORS                                                  │   │
│  │  • Security Headers                                      │   │
│  │  • Request ID Middleware                                  │   │
│  │  • Error Handling                                         │   │
│  └─────────────────────────┬───────────────────────────────┘   │
│                            │                                    │
└────────────────────────────┼────────────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  AUTH SERVICE   │ │  PAPER SERVICE  │ │   AI SERVICE    │
│  • JWT Tokens   │ │  • Upload       │ │  • Gemini       │
│  • Passwords    │ │  • Storage      │ │  • OpenAI       │
│  • OTP          │ │  • Search       │ │  • Analysis     │
│  • Sessions     │ │  • Download     │ │                 │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                        DATA LAYER                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │  PostgreSQL  │  │   Redis     │  │   Supabase  │            │
│  │  (Primary)   │  │  (Cache)    │  │  (Storage)  │            │
│  │              │  │             │  │             │            │
│  │  • Users     │  │  • Sessions │  │  • PDFs     │            │
│  │  • Papers    │  │  • Rate     │  │  • Images   │            │
│  │  • Questions │  │    Limits   │  │             │            │
│  │  • Audit     │  │  • Cache    │  │             │            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
│                                                                │
└─────────────────────────────────────────────────────────────────┘
```

## Component Details

### Backend (FastAPI)

| Component | Purpose |
|-----------|---------|
| `app/routers/` | API endpoint definitions |
| `app/services/` | Business logic |
| `app/models/` | SQLAlchemy ORM models |
| `app/schemas/` | Pydantic request/response schemas |
| `app/repositories/` | Database access layer |
| `app/middleware/` | Request/response middleware |
| `app/core/` | Configuration, auth, database |

### Frontend (React)

| Directory | Purpose |
|-----------|---------|
| `smartpyq-frontend/src/pages/` | Page components |
| `smartpyq-frontend/src/components/` | Reusable UI components |
| `smartpyq-frontend/src/hooks/` | Custom React hooks |
| `smartpyq-frontend/src/lib/` | API clients, utilities |

### Database Schema

#### Core Tables

- **users** - User accounts and authentication
- **tenants** - Multi-tenant support
- **papers** - PYQ paper metadata
- **questions** - Extracted questions
- **question_groups** - Similar question clustering
- **bookmarks** - User bookmarks
- **audit_logs** - System audit trail

### Authentication Flow

```
User → Login → Validate Credentials → Generate JWT → Return Token
                                                         │
Client ← Store Token ←───────────────────────────────────┘
   │
   ▼
Request + Bearer Token → Validate JWT → Extract User → Process Request
```

### File Upload Flow

```
User → Select File → Validate (type, size) → Upload to Supabase Storage
                                                    │
                                                    ▼
                                            Store Metadata in DB
                                                    │
                                                    ▼
                                            Return Success
```

## Security Architecture

### Authentication

- JWT tokens with configurable expiration
- Argon2 password hashing
- Rate limiting on auth endpoints
- OTP for email verification

### Authorization

- Role-based access control (Student, Admin)
- Stream-based paper access
- Resource ownership validation

### Data Protection

- HTTPS enforcement in production
- Security headers (CSP, HSTS, etc.)
- Input validation on all endpoints
- SQL injection prevention (SQLAlchemy ORM)

## Deployment Architecture

### Development

```
Local Machine
├── FastAPI (uvicorn --reload)
├── SQLite (local file)
└── Local file storage
```

### Production

```
Docker Compose
├── Backend (FastAPI + Gunicorn)
│   └── 4 workers
├── PostgreSQL 16
├── Redis 7
└── Volumes
    ├── postgres_data
    ├── redis_data
    ├── uploads_data
    └── logs_data
```

## Performance Considerations

### Database

- Connection pooling (20 connections, 10 overflow)
- Query timeouts (30s)
- Connection recycling (1 hour)
- Pre-ping validation

### Caching

- Redis for session/cache (when configured)
- Local memory cache for development

### File Storage

- Supabase for scalable storage
- Signed URLs for secure access
- Local fallback for development

## Monitoring & Observability

### Endpoints

- `/health` - Liveness probe
- `/ready` - Readiness probe
- `/version` - Build information

### Logging

- Structured JSON logging
- Request ID tracking
- Error correlation

### Metrics (Future)

- Request rate
- Error rate
- Latency
- Database connections

## Scalability

### Horizontal Scaling

- Stateless API (JWT auth)
- Database connection pooling
- External file storage (Supabase)

### Vertical Scaling

- Multi-worker ASGI server
- Connection pool tuning
- Query optimization

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React, Vite, TailwindCSS |
| Backend | FastAPI, Python 3.12 |
| Database | PostgreSQL (prod), SQLite (dev) |
| Cache | Redis |
| Storage | Supabase Storage |
| Auth | JWT, Argon2 |
| AI | Gemini, OpenAI |
| Deploy | Docker, Docker Compose |

# Deploy Backend to Render

## Step 1: Create Render Account
1. Go to https://render.com
2. Sign up with your GitHub account

## Step 2: Create New Web Service
1. Click **New +** → **Web Service**
2. Connect your GitHub repo: `sumer52/smartpyq-project`
3. Configure:
   - **Name:** `smartpyq-backend`
   - **Runtime:** Python
   - **Build Command:** `pip install -r requirements.txt && alembic upgrade head`
   - **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Plan:** Free

## Step 3: Create PostgreSQL Database
1. Click **New +** → **PostgreSQL**
2. Configure:
   - **Name:** `smartpyq-db`
   - **Plan:** Free
   - **Database:** `smartpyq`
3. Copy the **Internal Database URL**

## Step 4: Set Environment Variables
In your Web Service → **Environment** tab, add:

| Variable | Value |
|----------|-------|
| `ENV` | `production` |
| `DEBUG` | `false` |
| `DATABASE_URL` | (paste Internal Database URL from Step 3) |
| `JWT_SECRET` | (generate: `python -c "import secrets; print(secrets.token_urlsafe(64))"`) |
| `ALLOWED_HOSTS` | `.onrender.com` |
| `ALLOWED_ORIGINS` | `https://your-frontend.vercel.app` |
| `CORS_ORIGINS` | `https://your-frontend.vercel.app` |
| `LOG_LEVEL` | `INFO` |
| `LOG_FORMAT` | `json` |
| `DEV_EMAIL_LOG_OTP` | `false` |

## Step 5: Deploy
1. Click **Create Web Service**
2. Wait for build to complete (~2-3 minutes)
3. Your backend will be live at: `https://smartpyq-backend.onrender.com`

## Step 6: Test
```bash
curl https://smartpyq-backend.onrender.com/health
curl https://smartpyq-backend.onrender.com/docs
```

## Important Notes
- **Free tier spins down after 15 min inactivity** — first request takes ~30s to wake up
- **Database is also free** — 90-day retention, then deleted if inactive
- **Update CORS_ORIGINS** after deploying frontend to Vercel

## Optional: Always-On
To prevent spin-down, upgrade to paid plan ($7/month) or use a cron job to ping the health endpoint every 10 minutes.

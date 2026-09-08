# Deploy Backend to Render

The existing FastAPI backend runs directly on Render's native **Python** runtime. The React/Vite frontend stays on its existing host.

## Existing Render service

1. Open the backend service in the [Render dashboard](https://dashboard.render.com).
2. In **Settings → Build → Source → Edit**, select the existing repository and deployment branch, and set the runtime to **Python**.
3. Keep the root directory at the repository root (leave it blank), not `smartpyq-frontend`.
4. Set the build command to:
   ```bash
   python -m pip install -r requirements.txt && python -m alembic upgrade head
   ```
5. Set the start command to:
   ```bash
   python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT
   ```
6. Set the health check path to `/health`.
7. `.python-version` selects Python 3.12, matching CI. If an existing `PYTHON_VERSION` environment variable overrides it, remove that override or set it to a supported full 3.12 patch version.
8. Preserve the existing `DATABASE_URL`, `JWT_SECRET`, storage, email, Redis, and AI settings in **Environment**. Do not create a replacement database or regenerate a working signing secret.
9. Set `ENV=production`, `DEBUG=false`, and `DEV_EMAIL_LOG_OTP=false`. Use the exact backend hostname or `*.onrender.com` for `ALLOWED_HOSTS`, plus any custom backend domain. Set `ALLOWED_ORIGINS` and `CORS_ORIGINS` to the frontend's exact HTTPS origin.
10. Deploy the updated branch. Render supplies `PORT`; the start command binds to `0.0.0.0`.

Changing repository files alone does not update the runtime of a manually configured Render service. Apply the settings above in the dashboard. If using a Blueprint, sync the updated `render.yaml` instead and review its planned changes before applying them.

## New service

1. Select **New → Web Service** and connect `sumer52/smartpyq-project`.
2. Use the runtime, root directory, build command, start command, and health check above.
3. Reuse your existing PostgreSQL database by setting its connection string as `DATABASE_URL`. Only create a new database when setting up a genuinely new installation. For Render-to-Render connections in the same region, use the database's internal URL.
4. Configure all required environment variables before the first build because Alembic needs database access. See [the complete deployment guide](docs/DEPLOYMENT.md#environment-variables).
5. For a new installation only, generate a strong `JWT_SECRET` of at least 32 characters and store it in Render.

The included `render.yaml` retains the existing Blueprint database definition and generated-secret configuration for new installations. Do not apply it as a new Blueprint over a manually configured production installation unless you intend to provision new resources.

## Frontend connection and verification

Keep the frontend deployment unchanged. If the backend URL changes, update only its existing `VITE_BACKEND_URL` environment variable and rebuild the frontend.

Check the backend after deployment:

```bash
curl https://your-backend.onrender.com/health
curl https://your-backend.onrender.com/ready
curl https://your-backend.onrender.com/version
```

`/docs` is intentionally disabled when `ENV=production`. Test login/OTP delivery, uploads, downloads, analysis, and AI chat from the frontend before switching production traffic.

## Runtime requirements

- Keep existing external storage, or mount a persistent disk for local uploads. The default Render filesystem does not persist across redeploys.
- Choose a service plan that supports the existing SMTP connection and any required persistent disk. Check current Render plan limits and database expiry policies rather than relying on free resources for production data.
- The existing optional OCR and virus-scanning features require native executables in addition to their Python packages. See [runtime capabilities](docs/DEPLOYMENT.md#existing-optional-capabilities) and verify availability before using them.
- Back up the database before migration-bearing deployments. The existing build-time migration step is retained; it is not a request to modify a live database from this repository checkout.

# Monitoring: backend health alerts

The production backend is watched by a scheduled GitHub Actions workflow,
[`backend-health.yml`](../.github/workflows/backend-health.yml). This page says
what that alert means and what to do when it fires.

## What runs

| | |
|---|---|
| Workflow | `Backend health monitor` (`.github/workflows/backend-health.yml`) |
| Schedule | every 10 minutes (`*/10 * * * *`), plus **Run workflow** manually from the Actions tab |
| Check | `GET https://smartpyq-backend.onrender.com/health` must return HTTP 200 with `{"status":"healthy",…}` |
| Retries | 3 attempts, 90 s timeout each, 20 s apart — a cold free-tier instance waking up does **not** alert |
| Fails when | all 3 attempts miss 200 (≈2.5 minutes of unresponsiveness) |
| Alert channel | the failed workflow run — GitHub emails the workflow author / repo watchers, and the run page carries the status code and response body |
| Optional push | if the repo secret `ALERT_WEBHOOK_URL` is set, the failure is also POSTed there (Slack, Discord, or any JSON webhook) |

`keep-warm.yml` also pings `/health` every 5 minutes, but it only keeps the
free Render instance from spinning down and never fails — it is not the alert.

## What the alert means

**The backend is not serving HTTP 200 on `/health`.** The frontend cannot reach
any API, so every page that loads data (PYQ Hub, Practice, AI, admin) shows its
error state. In the last outage this exact failure mode was a missing database:
each deploy died at `alembic upgrade head` and the URL answered nothing.

It is **not**:

- a cold start (retries absorb those),
- an empty database or a slow page (health can be 200 while data is empty),
- a frontend/CDN problem (that is what `nightly-intro-check.yml` watches).

## Triage, in order

1. **Reproduce it.** `curl -i -m 90 https://smartpyq-backend.onrender.com/health`
   - no response / timeout → the service is down or still booting;
   - `502`/`503` → Render is up but the app failed to start;
   - `200` → the alert was a transient blip; check the run's timestamps.
2. **Render service state** — dashboard → `smartpyq-backend`: is it
   *suspended*, *deploying*, or *failed*? Check the latest deploy's status.
   A run of `update_failed` means the app never started.
3. **Deploy logs** (Render → the service → Logs) for the newest deploy. The
   usual suspects, in the order they have actually happened:
   - `socket.gaierror: [Errno -2] Name or service not known` at
     `alembic upgrade head` → `DATABASE_URL` points at a database that no
     longer exists (free Render Postgres is deleted 30 days after creation).
     Fix: Render → Environment → `DATABASE_URL` → *connect to database*.
   - `PRODUCTION CONFIG ERROR: …` → startup validation refused to boot; the
     message names the offending variable (usually `JWT_SECRET`).
   - `No open ports detected` → the process died before binding `$PORT`.
4. **Database** — dashboard → `smartpyq-db`: `Available` or `Suspended`? Free
   instances expire and are then deleted. If it is gone, create a replacement
   in the same region, point `DATABASE_URL` at it, and redeploy: migrations and
   the demo seeds run on boot.
5. **Redeploy** — Manual Deploy → *Deploy latest commit*. The start command
   (`alembic upgrade head && seeds && uvicorn`) is idempotent.

## Configuring it

- **Different URL:** set a repo secret `BACKEND_URL` (Actions → Settings →
  Secrets and variables → Actions). Without it the workflow falls back to
  `https://smartpyq-backend.onrender.com`.
- **Push alerts:** create a repo secret `ALERT_WEBHOOK_URL` with a Slack or
  Discord incoming-webhook URL. The payload contains both `text` (Slack) and
  `content` (Discord). Leave it unset to rely on GitHub notifications only;
  the run log then prints a notice instead of posting.
- **Turn it off:** Actions tab → *Backend health monitor* → `…` → *Disable
  workflow*. Delete the file to remove it entirely.

## Limits worth knowing

- GitHub cron is best-effort: a run can start several minutes late, so
  detection is "within ~10–20 minutes", not instant.
- GitHub **disables scheduled workflows after 60 days without repository
  activity** — if the repo goes quiet for two months, re-enable it in the
  Actions tab (a run started by `workflow_dispatch` also resets the timer).
- GitHub notifications depend on your notification settings (Settings →
  Notifications → Actions: *failed workflows only* is the default and is
  enough). For pages outside GitHub — SMS, phone call, on-call escalation —
  point `ALERT_WEBHOOK_URL` at a paging service instead.
- The check covers liveness, not correctness: a backend that answers `/health`
  but returns empty catalogs stays green (see the `/api/v1/papers/catalog`
  check in the outage notes).

# Render Database Setup — Visual Step-by-Step

## What is "Internal Database URL"?

When you create a PostgreSQL database on Render, it gives you **two URLs**:

1. **Internal URL** — for other Render services (your backend) to connect
2. **External URL** — for connecting from outside Render (your local computer)

You need the **Internal URL** because your backend runs on Render too.

---

## Step-by-Step with Screenshots

### Step 1: Go to Render Dashboard
👉 **https://dashboard.render.com**

### Step 2: Click "New +"
Look for the blue **"+ New"** button (top right or left sidebar)

### Step 3: Select "PostgreSQL"
Click **"PostgreSQL"** from the dropdown menu

### Step 4: Fill in the Form
You'll see a form like this:

```
Name:        smartpyq-db
Database:    smartpyq
User:        (leave blank - Render generates it)
Region:      Oregon (US West) — or closest to you
Version:     16 (default)
Plan:        Free
Storage:     1 GB
```

### Step 5: Click "Create Database"
Bottom of the form → **"Create Database"** button

### Step 6: Wait for "Available" Status
Your database will show:
- ⏳ Creating... (wait 1-2 minutes)
- ✅ **Available** (ready to use!)

### Step 7: Copy the Internal URL
Once status is "Available":

1. **Click on your database name** (`smartpyq-db`)
2. Look for the **"Connections"** section
3. You'll see two URLs:

```
Internal Database URL:    postgresql://user:password@dpg-xxxxx.oregon-postgres.render.com/smartpyq
External Database URL:    postgresql://user:password@dpg-xxxxx.oregon-postgres.render.com/smartpyq
```

4. **Click the copy icon** next to **Internal Database URL** 📋

### Step 8: Paste It
Paste the copied URL into your backend's `DATABASE_URL` environment variable.

---

## What the URL Looks Like
```
postgresql://smartpyq_user:abc123xyz@dpg-xxxxxxxxxxxx-a.oregon-postgres.render.com/smartpyq
```

Breaking it down:
- `smartpyq_user` = your database username
- `abc123xyz` = your database password (auto-generated)
- `dpg-xxxxxxxxxxxx-a.oregon-postgres.render.com` = Render's PostgreSQL server
- `smartpyq` = your database name

---

## Common Mistakes

❌ **Don't use External URL** — it's for connecting from your local computer
✅ **Use Internal URL** — it's faster and more secure for Render-to-Render communication

❌ **Don't share this URL** — it contains your password
✅ **Store it in Render's environment variables** — never commit to GitHub

# IPT Final Project Backend (REST API)

Node.js + Express + **MySQL** (`mysql2`). Typical setup: **API on Render** (or your PC) + **MySQL on InfinityFree** (or any host that gives a remote hostname).

## InfinityFree MySQL → `.env` / Render env vars

Use the values from your control panel (never commit real passwords):

| Variable | Example |
|----------|---------|
| `DB_HOST` | `sql103.infinityfree.com` |
| `DB_PORT` | `3306` |
| `DB_USER` | your InfinityFree MySQL user |
| `DB_PASSWORD` | your panel password |
| `DB_NAME` | exact name from the panel |

Copy `.env.example` → `.env` and fill in. On **Render**, add the same keys under **Environment**.

1. In **phpMyAdmin** (InfinityFree), create the database if needed, then run **`sql/gym_db.sql`** (or paste its `CREATE TABLE` statements).
2. Allow **remote** connections if the panel has **Remote MySQL** / access hosts — follow InfinityFree’s docs (sometimes `%` or specific hosts). Without this, Render cannot reach the DB.

## Local run

```bash
npm install
npm run dev
```

Open `http://localhost:3000/health` → `{"ok":true,"db":true}` when MySQL accepts your credentials.

## Deploy API on Render (MySQL stays on InfinityFree)

1. Push repo to GitHub → **New Web Service** → Build `npm install`, Start `npm start`.
2. Set **Environment** to `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`.
3. Deploy → test `https://<your-service>.onrender.com/health`.
4. Android **BASE_URL**: `https://<your-service>.onrender.com/`

`render.yaml` in this repo is **web-only** (no Render Postgres); add MySQL vars in the dashboard.

## Endpoints

- `GET /` — basic status  
- `GET /health` — API + MySQL  

### Gym (Retrofit)

| Method | Path |
|--------|------|
| `POST` | `/api/login` |
| `GET` | `/api/members` |
| `POST` | `/api/members` |
| `POST` | `/api/attendance` |
| `GET` | `/api/payments` |
| `GET` | `/api/trainers` |

## Schemas

- **`sql/gym_db.sql`** — MySQL (InfinityFree, phpMyAdmin).  
- **`sql/gym_db_postgres.sql`** — only if you switch back to PostgreSQL.

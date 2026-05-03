# IPT Final Project Backend (REST API)

## Setup

1) Install dependencies

```bash
npm install
```

2) Create your environment file

- Copy `.env.example` to `.env`
- Fill in your MySQL credentials

3) Run the API

```bash
npm run dev
```

The server starts at `http://localhost:3000` (or `PORT`).

## Endpoints

- `GET /` basic status
- `GET /health` checks API + MySQL connection (`SELECT 1`)

### Gym app (Android / Retrofit)

Apply the schema in `sql/gym_db.sql` in MySQL (or phpMyAdmin), then set `DB_NAME=gym_db` in `.env`.

| Method | Path | Purpose |
|--------|------|--------|
| `POST` | `/api/login` | Body: `{ "username", "password" }` → `{ success, user }` (password omitted from `user`) |
| `GET` | `/api/members` | List members (array) |
| `POST` | `/api/members` | Body: `{ full_name, phone, email }` → `{ id, message }` |
| `POST` | `/api/attendance` | Body: `{ member_id }` → `{ success, message }` |
| `GET` | `/api/payments` | Payments joined with `members.full_name` |

**Android base URL:** emulator `http://10.0.2.2:3000/` · physical device: `http://<your-PC-LAN-IP>:3000/`


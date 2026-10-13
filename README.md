# HotSport Inventory — Deploy

Node.js + MongoDB PWA for HotSport stock, POS barcode, orders & HR.

## Quick local run

```bash
cd hotsport-stock
cp .env.example .env
npm install
# MongoDB must be running locally
npm start
```

Open http://127.0.0.1:3090/login.html

### Demo accounts
| Role | Email | Password |
|------|-------|----------|
| Admin | admin@hotsport.tn | admin123 |
| Manager | manager@hotsport.tn | manager123 |
| Seller | seller@hotsport.tn | seller123 |

## Environment variables

Copy `.env.example` → `.env` and set:

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `SESSION_SECRET` | Yes (prod) | Long random secret |
| `NODE_ENV` | No | `production` on deploy |
| `HOST` | No | Default `0.0.0.0` in production |
| `PORT` | No | Default `3090` (PaaS often sets this) |
| `SEED_ON_START` | No | Seed demo if DB empty (`true`) |
| `FORCE_SEED` | No | Reseed every boot (`false`) |
| `COOKIE_SECURE` | No | Force secure cookies (`true` on HTTPS) |
| `APP_URL` | No | Public URL of the app |

## Deploy with Docker (recommended)

```bash
cd hotsport-stock
cp .env.example .env
# edit SESSION_SECRET in .env
docker compose up -d --build
```

App: http://localhost:3090  
Health: http://localhost:3090/api/health

Stop:

```bash
docker compose down
```

## Deploy on Render

1. Push this folder to GitHub.
2. New **Blueprint** → select `render.yaml`, or create a **Web Service**.
3. Add a MongoDB Atlas free cluster and set `MONGODB_URI`.
4. Set `SESSION_SECRET` (auto-generated if using Blueprint).
5. Set `APP_URL` to your Render URL (`https://….onrender.com`).
6. Deploy. Health check path: `/api/health`.

## Deploy on Railway / Fly / Heroku

1. Connect the repo (root = `hotsport-stock` or set root directory).
2. Add MongoDB plugin / Atlas URI as `MONGODB_URI`.
3. Set `SESSION_SECRET`, `NODE_ENV=production`, `HOST=0.0.0.0`.
4. Start command: `npm start` (Procfile included for Heroku).

## Production checklist

- [ ] Strong `SESSION_SECRET`
- [ ] MongoDB Atlas (or managed Mongo) with network access for your host
- [ ] HTTPS enabled (PaaS usually does this)
- [ ] `FORCE_SEED=false` after first boot
- [ ] Change demo passwords after go-live
- [ ] PWA: open site over HTTPS → Install app

## API health

`GET /api/health` → `{ ok, env, db, time }`

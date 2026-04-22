# Grandparents Bot

This repo can now run in two modes without changing the app code:

- Local development: frontend on `http://localhost:3000`, backend on `http://localhost:8000`
- NAS deployment: both apps in Docker, with the frontend proxying `/api` to the backend inside Docker

## Local Run

Backend:

```bash
cd backend
python -m venv ../venv
source ../venv/bin/activate
pip install -r requirements.txt
python main.py
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Local env files:

- `backend/.env`: Upace seed credentials and backend settings
- `frontend/.env.local`: `NEXT_PUBLIC_API_URL=http://localhost:8000`

Local persistence stays where it already was:

- SQLite: `backend/grandparents_bot.db`
- Secret key: `backend/.app_secret_key`

## NAS / Docker Run

1. Copy `backend/.env.example` to `backend/.env` and fill in the real Upace values.
2. Create the persistent data directory:

```bash
mkdir -p backend/data
```

3. Build and start the containers:

```bash
docker compose build
docker compose up -d
```

4. Open `http://YOUR-NAS-IP:3000`

For Docker, persistence moves into `backend/data`:

- SQLite: `backend/data/grandparents_bot.db`
- Secret key: `backend/data/.app_secret_key`

The frontend container uses `NEXT_PUBLIC_API_URL=/api`, and Next.js rewrites `/api/*` to the backend container. That means a reverse proxy on the NAS only needs to expose the frontend container in most setups.
The compose file keeps the backend private by default; it is reachable from the frontend container, but it does not publish port `8000` to the NAS host.

## Reverse Proxy

Recommended NAS setup:

- Route public traffic to the frontend container on port `3000`
- Keep the backend container private on the Docker network
- Set `CORS_ORIGINS` in `backend/.env` to include your NAS URL if you still want direct browser access to the backend

Example:

```env
CORS_ORIGINS=http://localhost:3000,https://planner.example.com
```

## Notes

- The NAS must have outbound access to `https://www.upaceapp.com/Api`
- `NEXT_PUBLIC_API_URL` is baked into the frontend build, so changing it in Docker requires rebuilding the frontend image
- Keep the database file and `.app_secret_key` together; the encrypted Upace secrets depend on that key

# Backend

## Local Run

```bash
cd backend
source ../venv/bin/activate
pip install -r requirements.txt
python main.py
```

The API defaults to `http://localhost:8000`.

Local persistence:

- Database: `backend/grandparents_bot.db`
- Secret key: `backend/.app_secret_key`
- Seeded planner access: set `AUTO_LOGIN_ACCOUNTS=true` in `backend/.env` so the frontend can bootstrap the seeded accounts into authenticated sessions on load

## Docker / NAS Run

The Docker path is driven by `docker-compose.yml` at the repo root.

- It reads seed settings from `backend/.env`
- It stores persistent files in `backend/data`
- It disables hot reload inside the container

Container persistence:

- Database: `/app/data/grandparents_bot.db`
- Secret key: `/app/data/.app_secret_key`

## API Summary

Accounts:

- `POST /accounts/register`
- `GET /accounts`
- `GET /accounts/me`
- `GET /accounts/{account_id}`
- `POST /accounts/{account_id}/login`
- `POST /accounts/logout`
- `DELETE /accounts/{account_id}`

Classes:

- `GET /classes/available/{account_id}?date=YYYY-MM-DD`
- `POST /classes/select`
- `GET /classes/selected/{account_id}`
- `DELETE /classes/selected/{selection_id}`
- `POST /classes/book/{account_id}`

`POST /classes/book/{account_id}` accepts a JSON body with `selection_ids`, so the frontend can book only the week currently being reviewed.

## Storage and Auth

- App passwords are stored as password hashes
- Stored Upace credentials are encrypted at rest
- Browser sessions use bearer tokens whose hashes are stored in SQLite

## Scheduler

Every Sunday at 1:00 PM, the scheduler re-authenticates each stored account and tries to book any remaining saved selections.

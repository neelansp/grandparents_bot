# Frontend

## Local Run

```bash
cd frontend
npm install
npm run dev
```

Local development expects `frontend/.env.local` to contain:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

That keeps the existing browser-to-backend localhost flow.

## Docker / NAS Run

The Docker image is built with:

- `NEXT_PUBLIC_API_URL=/api`
- `BACKEND_INTERNAL_URL=http://backend:8000`

In Docker, the browser talks to the frontend only. Next.js then rewrites `/api/*` requests to the backend container over the internal Docker network.

If you change `NEXT_PUBLIC_API_URL`, rebuild the frontend image because that value is embedded in the client bundle.

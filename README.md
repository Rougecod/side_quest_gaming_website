# side_quest_gaming_website

Side Quest Gaming website with an Express backend, SQLite storage, booking/session routes, admin pages, payment hooks, email notifications, and the static frontend in `website/`.

## Run locally

```bash
npm install --prefix server
npm start
```

The app serves the website and API from the server process. By default it runs on:

```text
http://localhost:3000
```

## Deployment

Use the repository files plus environment variables from `server/.env.example`.

Recommended deployment settings:

```text
Build command: npm install --prefix server
Start command: npm start
```

Do not upload a real `.env` file to GitHub. Add those values in your hosting provider's environment-variable dashboard.

## Frontend on Vercel

Set the Vercel project root directory to:

```text
website
```

Use:

```text
Build command: npm run build
Output directory: dist
```

After the backend is deployed, add this Vercel environment variable:

```text
VITE_API_BASE=https://your-deployed-backend-url
```

Without `VITE_API_BASE`, login/signup requests cannot reach the Express API from Vercel.

## Backend on Render

This repo includes `render.yaml` for deploying the Express backend. In Render, create a new Blueprint from this GitHub repository, then fill the secret values Render asks for.

Render will use persistent disk storage for SQLite:

```text
SQLITE_DB_PATH=/var/data/quest.db
```

After Render deploys, copy the Render service URL into Vercel as `VITE_API_BASE`.

## Runtime data

The backend creates `server/quest.db` automatically when it starts. For production, use a host with persistent disk storage, otherwise bookings and wallet data may be lost after redeploys or restarts.

These files are intentionally not committed:

```text
server/.env
server/node_modules/
server/quest.db
server/quest.db-shm
server/quest.db-wal
*.log
```

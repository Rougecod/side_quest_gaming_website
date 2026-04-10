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

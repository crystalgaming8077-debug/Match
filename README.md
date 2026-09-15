# AKTan V25 — Render Ready

## Deploy
1. Upload these files to a GitHub repository.
2. In Render: New -> Web Service -> connect the repository.
3. Runtime: Node.
4. Build command: `npm install`
5. Start command: `npm start`
6. Health check: `/health`
7. Deploy.

The server listens on `0.0.0.0` and uses Render's `PORT` environment variable.

## Public spectator
Open the deployed URL in the admin browser, create the Public Link, then share only that tokenized URL with spectators.

## Important data note
This version stores shared tournament state in `public-data.json`. Render's free web service filesystem is not a durable database. For a real tournament with important registrations, use a persistent database or persistent disk before relying on it as the sole copy of data. Keep your existing V24/V25 local backup.

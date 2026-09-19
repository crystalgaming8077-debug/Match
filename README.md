# AKTan V25 PostgreSQL Persistent Build

This build keeps the V25 HTML as the UI and adds PostgreSQL-backed persistence to the public tournament server.

## Render setup
1. Keep the PostgreSQL database available on Render.
2. In the Web Service Environment, set `DATABASE_URL` to the database's **Internal Database URL**.
3. Push/replace ALL files from this package in the GitHub repository used by the Render Web Service.
4. Deploy the latest commit.
5. Open `/health`. A correct setup returns `persistentStore: true` and version `25.2.0-postgres`.

The server automatically creates the `aktan_publications` table. If a local `public-data.json` exists and the PostgreSQL table is empty, it migrates those publications once.

Never commit `DATABASE_URL` or database passwords to GitHub.


## V26.2 Public Contest Rooms
Unlimited public rooms/contests with independent category, format, map, slot capacity, entry-fee display, prize pool, start time, status and rules. Public registration selects a room and the server enforces capacity including pending registrations. Entry fee is display/information only; payment collection, verification and refunds remain outside the app. Admin PIN can be changed from the Admin/Teams area.


## V26.2 updates
- Room-specific public registration validation for Solo/1v1/2v2/3v3/4v4/Squad.
- Attractive room thumbnail upload + preview + public display.
- Large visible “PAYMENT AFTER ALL SLOTS ARE FULL” banner on public room cards.
- Admin PIN fields support up to 30 characters.


## V27 Public Premium Room-wise Upgrade
- Premium dark esports public theme with gold/purple/blue neon accents.
- Animated All / Odd / Even public slot selector inspired by the existing Slot Page animation.
- Room-wise accepted teams: public Teams view can be scoped to a selected room.
- Room-wise leaderboard: public Rank view can be scoped to a selected room.
- Room cards include room teams and room leaderboard actions.
- Room-scoped public slots with accepted/available status.
- Existing admin, registration, approval, OCR, leaderboard, print and server logic retained.

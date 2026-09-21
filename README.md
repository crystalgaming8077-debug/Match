# AKTan Tournament PointCalc V26.5 — Server Push Notifications

This build keeps the existing Supabase/PostgreSQL persistence and adds server-side Web Push notifications for new public registrations.

## Setup on Render + Supabase
- Keep the existing `DATABASE_URL` environment variable pointing to the Supabase PostgreSQL connection string.
- Deploy normally with `npm install` / `npm start`.
- The server automatically creates the required push tables in the same PostgreSQL database and generates/stores VAPID keys there once.
- HTTPS is required for browser push in production; Render's public HTTPS URL satisfies this.

## Enable notifications
1. Open the main/admin tournament page on the Android phone that should receive alerts.
2. Create/use the existing public link.
3. Tap **🔔 Enable Registration Notifications** and allow browser notifications.
4. Tap **🧪 Test Notification** to verify the phone receives a push.
5. A new public registration will then trigger a server-side push notification.

The service worker is served at `/push-sw.js`, so Chrome does not need to remain open in the foreground. Android/Chrome still controls battery/background delivery and notification permissions.

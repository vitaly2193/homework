# Домашка / Homework

Family homework tracker for class 2 «Г», in Russian. All dates and reminders use **Europe/Moscow**.

## App

- Shared homework with due dates, editable text, original teacher messages, and private photos.
- To-do / in-progress / done status; next school day, all unfinished, and completed views.
- Separate “nothing assigned” confirmations, so missing homework information stays visible.
- School timetable plus extra English on Tuesday 09:30–10:30 and Thursday 10:30–11:30.
- Supabase email/password sign-in. One parent creates the family; other accounts join with a 7-day invitation code.
- Installable Android PWA, Web Push reminders (19:00 Moscow by default), and JSON export.

## Development

Requires Node 24 and npm. Run `npm ci`, then `npm run dev`. Run `npm test`, `npx tsc --noEmit`, and `npm run build` before deployment.

The scaffold uses React, TypeScript, Vinext (Vite), and the provided UI primitives. `output: 'export'` produces static assets under `dist/client`. **Hosting is the user's own Cloudflare Pages account**, not a separate managed Sites deployment. No database password or backend secret is needed to build the frontend.

The Supabase URL and publishable key in `lib/config.ts` are public project identifiers. Database row policies enforce access. Never place a database password, service-role key, or push private key in frontend code.

## Database maintenance

The user's original local password file is one directory above this checkout (`../.env`). It stays there and is ignored. `.env.example` documents its format. `scripts/db.mjs` defaults to this parent file; alternatively set `HOMEWORK_ENV_FILE` to an absolute file path.

Database connections verify TLS with Supabase's CA from its dashboard. Apply numbered files in `supabase/migrations` **once, in order**. They are not reset scripts. The deployed database already has migrations 001–004.

- `node scripts/db.mjs inspect`: check connectivity and table names.
- `node scripts/db.mjs file tests/rls.sql`: verify family isolation and reminder deduplication inside a rolled-back transaction.
- `node scripts/db.mjs configure-push`: generate notification credentials once; never prints or rotates existing keys.
- `node scripts/db.mjs test-reminder`: invoke the deployed worker with the private job credential. With active subscriptions this can send due reminders.

## Notifications

`supabase/functions/send-reminders/index.ts` runs on Supabase Edge Functions. Gateway JWT verification stays on. The caller also needs a random private job secret stored with VAPID keys in `homework_private.push_config`. Only the service role can read it through a restricted function.

The database scheduler checks once per minute, invokes the worker only near enabled users' chosen times, and sends only when assignments or missing homework confirmations remain. Delivery leases and a daily per-device record prevent normal duplicate sends. Failed deliveries have bounded retries; push notifications use a stable daily tag. Network failures after provider acceptance can still cause a retry; exact delivery is not guaranteed.

The public legacy anon key in `scripts/scheduler-public-key.txt` identifies this project and satisfies the gateway. It does not authorize the reminder function by itself. If legacy keys are rotated, update it and the scheduler function together.

Users must enable notifications on each device. Signing out unsubscribes that browser. Delivery needs network connectivity and Android/browser permission. Device delivery must be checked on the child's phone. No Firebase account is required; this implementation uses standards-based Web Push.

## Account setup

Supabase's default email sender is restricted to organization/team addresses. For general family self-registration, configure a production SMTP sender in Supabase, or create/confirm each family member's account through the Supabase dashboard. Keep email confirmation enabled. The app itself does not provision privileged accounts.

After hosting, set Supabase Auth's Site URL and allowed redirects to the deployed HTTPS origin so confirmation links return to the app. Sign in, choose “Создать дневник с нашим расписанием”, then create an invitation in “Семья”.

## Storage and portability

The original imported timetable is `lib/school-schedule.json`. Each family stores its own timetable in Supabase. JSON exports contain timetable, assignments and lesson confirmations; attached photos are not embedded and must be downloaded separately. Live family records are not stored in browser localStorage. The auth SDK stores the login session on the device.

## Scope

MAX messages are pasted manually or attached as screenshots. Automatic MAX ingestion and AI extraction are not enabled. Records refresh on focus and every 30 seconds while visible. Offline editing is not enabled.

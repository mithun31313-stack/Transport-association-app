# Transport Association Management App

Real production system: Node/Express + Prisma + PostgreSQL backend, React Native (Expo)
Android app. Manual bank-transfer salary payment workflow exactly as specified — the app
never moves money itself; it only records a transfer the admin already made in their own
banking app, after they enter the UTR.

```
transport-app/
  backend/     Express API + Prisma schema (PostgreSQL)
  mobile/      React Native / Expo app (builds to real APK/AAB)
```

## Why no compiled APK is attached

This was built in a sandboxed environment with no Android SDK, no Flutter, and no network
access to Google's Maven/pub.dev repositories — so nothing here can compile an .apk directly.
What you have instead is the **complete, real source code** for both the backend and the
Android app. You build the APK yourself in a few minutes using Expo's cloud build service
(no local Android Studio needed) — see "Build the Android APK" below.

---

## 1. Backend setup

```bash
cd backend
cp .env.example .env       # fill in DATABASE_URL and JWT_SECRET
npm install
npx prisma migrate dev --name init
npm run seed                # optional: creates a test Admin + Driver (Kumar)
npm run dev                  # http://localhost:4000
```

`DATABASE_URL` — get a free Postgres instance from **Neon**, **Supabase**, **Railway**, or
Render's managed Postgres. Example:
```
DATABASE_URL="postgresql://user:pass@host:5432/transport_association"
```

`JWT_SECRET` — generate with:
```bash
openssl rand -base64 48
```

### First-time association setup
Once the server is running, call the one-time setup endpoint to create the association and
the first Admin account (blocked after the first Admin exists):
```bash
curl -X POST http://localhost:4000/api/auth/setup \
  -H "Content-Type: application/json" \
  -d '{
    "associationName": "Your Association Name",
    "adminName": "Your Name",
    "adminPhone": "9999999999",
    "adminPassword": "a-strong-password"
  }'
```
(Or use `npm run seed` for instant test credentials — printed at the end of the script.)

### Deploying the backend
1. Push `backend/` to a GitHub repo.
2. On **Render** (or Railway): New Web Service → connect the repo → root directory `backend`.
   - Build command: `npm install && npx prisma generate && npx prisma migrate deploy`
   - Start command: `npm start`
   - Add the `.env` variables in the dashboard (`DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `PUBLIC_BASE_URL`).
3. Confirm `https://your-service.onrender.com/health` returns `{ ok: true }`.
4. Put the deployed URL + `/api` into the mobile app's `app.json → expo.extra.apiBaseUrl`.

**Backups:** enable your Postgres provider's automatic daily backups (Neon/Supabase/Render
all offer this in their dashboard) — the app itself doesn't manage backups; it's a database-
provider setting. Track `AppSettings.lastBackupAt` if you want to surface "Last Backup" on
an admin settings screen (update it from a scheduled job that confirms a backup ran).

---

## 2. Mobile app setup

```bash
cd mobile
npm install
```

Edit `app.json → expo.extra.apiBaseUrl` to point at your deployed backend, e.g.:
```json
"apiBaseUrl": "https://your-service.onrender.com/api"
```

Run it in development (Expo Go app on your phone, or an emulator):
```bash
npx expo start
```

Add your own app icon/splash image later — this scaffold ships without placeholder images so
the project installs cleanly; drop `icon.png` / `splash.png` into `mobile/assets/` and re-add
the corresponding fields to `app.json` when you're ready to brand it.

---

## 3. Build the Android APK

Uses **EAS Build** (Expo's cloud build) — no local Android SDK required.

```bash
cd mobile
npm install -g eas-cli
eas login                      # create a free Expo account if you don't have one
eas build:configure            # links this project to your EAS account, fills projectId
eas build --platform android --profile preview     # -> installable .apk
eas build --platform android --profile production  # -> .aab for Play Store
```

EAS gives you a download link when the build finishes (a few minutes). Install the `.apk`
directly on a phone for testing; use the `.aab` for a real Play Store release.

If you'd rather build fully locally: install Android Studio + the Android SDK, then
`npx expo prebuild` to generate the native `android/` project, and build with Gradle
(`./gradlew assembleRelease`) as usual for a bare React Native project.

---

## 4. The manual bank-transfer salary flow (core feature)

This is implemented exactly as specified, end to end:

1. Admin approves a `SalaryRecord` → status `APPROVED`.
2. Admin verifies the driver's bank account → `DriverBankAccount.verificationStatus = VERIFIED`.
3. Admin taps **Pay Salary** → `GET /api/salary-payments/prepare/:salaryId` returns the
   verified bank details. **Nothing is marked paid here.**
4. Admin manually transfers the money using their own bank app (outside this app).
5. Admin returns, enters the **UTR** and payment date, taps **Transfer Completed** →
   `POST /api/salary-payments/manual`.
6. The backend, inside a single DB transaction, re-validates everything (salary is
   `APPROVED`, bank is `VERIFIED`, net salary > 0, no existing payment for this salary),
   then atomically: creates the `SalaryPayment`, sets the salary to `PAID`, creates exactly
   one `ExpenseTransaction` (category `DRIVER_SALARY`), creates a driver `Notification`,
   generates a `Receipt` row, and writes `AuditLog` entries. The PDF is rendered right after
   commit and its URL is attached to the receipt.
7. A second payment attempt on the same salary is blocked by both an application check and
   a database `UNIQUE` constraint on `SalaryPayment.salaryId` — "This salary has already
   been paid."
8. Balance shown on the dashboard is always `SUM(income) - SUM(expenses)` computed live —
   never a stored/hard-coded number.

Run the exact test from the original spec (Section 50) against `npm run seed`'s test driver
Kumar to see this end to end.

---

## 5. Security notes already implemented

- Passwords hashed with bcrypt (12 rounds); JWT auth; role-based route guards (`ADMIN` /
  `DRIVER`) on every sensitive route; drivers can only ever read their own driver/salary/
  attendance/bank data (enforced server-side, not just hidden in the UI).
- `helmet` for secure headers, rate limiting on all `/api` routes and a tighter limit on
  `/api/auth/login`.
- Bank account numbers are masked (`XXXX XXXX 1234`) in every API response except to the
  account owner/admin; UPI PINs, ATM PINs, bank passwords, and OTPs are never fields in the
  schema — there's nowhere to put them even by mistake.
- No secrets are shipped in the Android app; it only ever talks to your backend over HTTPS.

## 6. What's deliberately not built (by spec)

No payment gateway, no payout API, no automatic bank transfer, no subscription/SaaS billing,
no multi-association support — matching Section 59 of the original spec exactly.

## 7. Extending this further

The schema (`backend/prisma/schema.prisma`) already includes every table from the spec
(documents, announcements, salary advances/deductions, member dues, audit logs, etc.). Routes
for the highest-stakes flows (auth, salary lifecycle, the payment engine, income/expense/
ledger, drivers + bank verification, attendance/work sessions, members, vehicles, reports,
announcements/notifications, audit log) are fully implemented. A few lower-risk list/CRUD
screens on the mobile side (documents, reports export to PDF/Excel/CSV, admin settings) are
intentionally left as straightforward extensions of the same patterns already in this
codebase — ask if you'd like any of those built out next.

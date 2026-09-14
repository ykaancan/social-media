# [BRAND] — release sign-off for the first event

Written 2026-09-14 at the end of backend step B-6. Everything below is what
separates the current build (frontend steps 1–8, backend steps B-1 to B-6, all
verified against each other) from a first event with real volunteers. Items are
grouped by who has to act. Nothing here needs a code change unless marked.

## 1. Decisions and inputs only the founder can give

- [ ] **Brand name.** `[BRAND]` is a placeholder in the app, the admin page and
      the Java package `app.brand`. One rename commit once the name exists.
- [ ] **Section list.** Confirm the ESN Türkiye sections in
      `backend/src/main/resources/db/migration/V2__reference_data.sql`. A change
      is a new migration, never an edit of V2.
- [ ] **Domain** for the API (for example `api.<brand>.app`) pointed at the
      server. The app is built with `EXPO_PUBLIC_API_URL=https://<that domain>`.
- [ ] **Privacy policy and terms URLs** (HTTPS). Set `EXPO_PUBLIC_PRIVACY_URL`
      and `EXPO_PUBLIC_TERMS_URL` in the app build. Until then the Settings
      screen shows them as unpublished, honestly.
- [ ] **KVKK**: VERBİS registration and the data-processing text. Data export
      (`GET /me/export`) and real deletion (`DELETE /me`) already exist.
- [ ] **Bootstrap admin email**: the address you will register with in the app.
      Set `BRAND_BOOTSTRAP_ADMIN_EMAIL` on the server; the account is promoted on
      the next server start after it registers.
- [ ] **Screening terms**: the initial hard-block and soft-flag word lists, typed
      into the admin page (Screening terms tab). They are data, not code.

## 2. Accounts and credentials to create

- [ ] **Server**: one small VM (2 GB RAM is enough for the first event — see the
      load check in `backend/BACKEND_PLAN.md`, B-6 record) with Docker, ports 80
      and 443 open. Follow `backend/DEPLOY.md`.
- [ ] **Secrets in `deploy/.env`**: `BRAND_JWT_SECRET` (`openssl rand -base64 32`),
      database password, `BRAND_PUBLIC_BASE_URL`, `BRAND_CORS_ALLOWED_ORIGINS`.
- [ ] **SMTP** for password-reset mail (`SPRING_MAIL_*`, `BRAND_MAIL_ENABLED=true`).
      Without it the reset link is only logged on the server.
- [ ] **Expo account + EAS project**: `eas init` in `app/` gives the `projectId`;
      an Expo access token goes in `BRAND_PUSH_EXPO_ACCESS_TOKEN` with
      `BRAND_PUSH_ENABLED=true`. Push cannot work in Expo Go on Android; the
      volunteers need a development or store build.
- [ ] **Apple Developer and Google Play accounts** for the store builds
      (`eas build`), plus the Android push credentials EAS asks for (FCM) and
      the iOS push key (APNs) — both handled by `eas credentials`.

## 3. Before the event, on the deployed server

- [ ] Deploy per `backend/DEPLOY.md`; confirm `https://<domain>/actuator/health`
      is `UP` and `/admin/` loads.
- [ ] Register your own account in the app, restart the API once, sign in to
      `/admin/` and confirm the Users tab shows the queue.
- [ ] Take one backup and **restore it once** into a scratch database to prove
      the procedure (`DEPLOY.md`, "Backups").
- [ ] Send one real password-reset mail to yourself.
- [ ] Register a second phone, send yourself a wall message, confirm the push
      arrives in the phone's language.
- [ ] Create the event, print the QR (Join code screen → share), and add one
      co-moderator.

## 4. Known limits of stage 1 (by design, from CLAUDE.md)

- No cold DMs, requests tab, discovery, search, images, payments or reveals as
  a paid action. Entitlement flags exist and are OFF.
- One server instance: the STOMP broker is in-memory, avatars are on the
  server's disk (`/data/avatars`, in the backup). A second instance needs the
  RabbitMQ relay and S3 storage the plan names as flip conditions.
- A super admin cannot be banned from the API; demote-by-hand is a SQL
  statement (`update app_user set role='member' where email=...`).
- Rate limits: 30 anonymous wall messages and 30 anonymous room posts per
  hour per person, 20 thread openings per day, one data export per minute.

## 5. What was verified, for the record

- Backend: 294 integration tests on Testcontainers; every step walked on an
  Android emulator against the real server; a code review of B-1 to B-3 with
  all ten findings fixed. Frontend: 381 tests, English and Turkish.
- Not verified on hardware: iOS at all, real push delivery, camera QR scanning
  on a physical device, and the full device matrix in `app/FRONTEND_REVIEW.md`
  on a physical Android phone. Do that matrix on your own phone before the
  event; it takes about an hour.

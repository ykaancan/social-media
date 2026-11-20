# Phone test on the home network

How to run the whole product on this PC and use it from a phone on the same
Wi-Fi. No domain, no mail service, no cost. Written 2026-11-21.

This is a test setup, not a deployment. Real hosting is `backend/DEPLOY.md`.

## What runs where

| Piece | Where | Address |
|---|---|---|
| Database | Docker container `brand-postgres`, database **`brand_test`** | not reachable from the phone |
| Backend | this PC | `http://192.168.1.2:8080` |
| App on the phone | Expo Go, loading from this PC | `exp://192.168.1.2:8082` |
| Admin page | browser on this PC | `http://localhost:8080/admin/` |

- `brand_test` is a separate, empty database inside the existing container. The
  development database `brand` is not touched by this test.
- `192.168.1.2` is this PC's address on the network (checked 2026-11-21 with
  `ipconfig`). If the router gives the PC another address, replace it everywhere
  below.
- Mail is off. Each confirmation and password-reset link is written to the
  backend's output; open the link in any browser to confirm that account.

## Start

1. Start Docker Desktop and wait until it is running.
2. Database:
   ```bash
   docker start brand-postgres
   ```
3. Backend, from `backend/`:
   ```bash
   BRAND_DB_NAME=brand_test BRAND_PUBLIC_BASE_URL=http://192.168.1.2:8080 BRAND_CORS_ALLOWED_ORIGINS=http://localhost:8082,http://192.168.1.2:8082 ./gradlew bootRun
   ```
   It is ready when it prints `Started Application`. Check from the phone's
   browser: `http://192.168.1.2:8080/actuator/health` shows `{"status":"UP"}`.
   If the phone cannot open that page, the phone is on another network or the
   Windows firewall is blocking Java.
4. App, from `app/`. The file `app/.env.local` must contain
   `EXPO_PUBLIC_API_URL=http://192.168.1.2:8080`.
   ```bash
   REACT_NATIVE_PACKAGER_HOSTNAME=192.168.1.2 npx expo start --lan --port 8082
   ```
   Open Expo Go on the phone and scan the QR code. On an iPhone, Expo Go must be
   signed in to the same Expo account as `npx expo login` on this PC.

## First run, in order

1. On the phone: sign up. The app shows "Confirm your email".
2. On the PC: find the line with `/confirm?token=` in the backend output and
   open that link in a browser. On the phone press "I've confirmed".
3. On the phone: fill in the profile.
4. Make that account the super admin. One statement against the test database:
   ```bash
   docker exec brand-postgres psql -U brand -d brand_test -c "update app_user set role='super_admin' where email='<the email you signed up with>'"
   ```
5. On the PC: open `http://localhost:8080/admin/` and sign in with the same
   account. In Organisations:
   - open "ESN Türkiye" and assign yourself as its admin, with a section;
   - create a second organisation with approval off and no sections (a bar).
6. On the phone: pull down on the Events tab. "Create" appears. Create one event
   in each organisation.

## A second person

Messages, walls and threads need two people. Use the web version on this PC as
the second person: from `app/`, `npx expo start --web --port 8083`, then open
`http://localhost:8083`. Sign up with another email and confirm it from the
backend output the same way.

The web version forgets the sign-in when the page is reloaded. That is how it is
built (the sign-in is kept in memory only on web), not a fault of the test.

## What to go through

- Sign-up, confirm, profile with a photo taken on the phone.
- Join the bar event by typing its code: straight in.
- As the second person, join the ESN event: section picker, waiting card.
  Approve from the admin page. The waiting card goes when the Events tab is
  opened again.
- Post to the room at each level: anonymous, hint, named. In the bar event only
  "First letter" is offered as a hint.
- Post to a person. On the other side: inbox, approve to wall, take off the
  wall, keep private, delete.
- Reply privately, reveal, block, report. The report shows in the admin page.
- Settings: who can write to me, muted words, change section, delete account.
- Projector mode on the event.
- Scan the event's QR code with the phone camera.
- Turkish: switch the language and look for cut-off or missing text.

## Known before the test

- No push notifications in Expo Go.
- Capital letters in titles follow the app's language, so "ESN Türkiye" reads
  "ESN TÜRKIYE" in the English app. Left as it is by decision.
- An approval shows when the Events tab is opened again or pulled down, not at
  once.
- An organisation admin cannot be removed from the admin page yet.

## Not verified

- This exact setup on the phone. The backend answers on `192.168.1.2:8080` from
  this PC; the phone side is the test itself.
- The web version opened from another device (`http://192.168.1.2:8083`). The
  backend answers such requests correctly, but the browser used for checking on
  2026-11-21 blocked them itself, so it was not seen working.
- Whether the Windows firewall still lets the phone reach ports 8080 and 8082.
  It did in September.

## Stop and clean up

- Stop the backend and the app with Ctrl+C in their terminals.
- To start again from nothing:
  ```bash
  docker exec brand-postgres psql -U brand -d brand -c "drop database brand_test"
  ```
  ```bash
  docker exec brand-postgres psql -U brand -d brand -c "create database brand_test owner brand"
  ```

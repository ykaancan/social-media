# [BRAND] backend

Spring Boot 3 (Java 21) + PostgreSQL 16 + Flyway. It replaces `MockApi` in the
Expo app; `app/src/api/*.ts` is the contract and this service implements it
rather than reinterpreting it. The plan, the decisions **[B1]**–**[B14]** and the
schema are in [`BACKEND_PLAN.md`](BACKEND_PLAN.md); the product contract is
[`../CLAUDE.md`](../CLAUDE.md).

## Prerequisites

- **Docker** — for the local database and for the tests (Testcontainers).
- **Nothing else.** The Gradle wrapper fetches Gradle 9.1, and the foojay
  toolchain resolver downloads the Java 21 toolchain, so the build does not care
  which JDK is on `PATH` **[B1]**.

## Start the database

```bash
docker compose -f backend/docker-compose.yml up -d      # postgres:16 on 5432
docker compose -f backend/docker-compose.yml logs -f    # optional
docker compose -f backend/docker-compose.yml down       # stop (keeps the volume)
```

Database `brand`, user `brand`, password `brand`, stored in the named volume
`brand-postgres-data`. `docker compose ... down -v` throws the data away, which
is how you get a clean Flyway run.

## Run the server

```bash
cd backend
./gradlew bootRun
```

`bootRun` activates the `dev` profile, which supplies a **development-only** JWT
secret so a fresh clone starts. Flyway migrates on startup. Check it:

```bash
curl http://localhost:8080/actuator/health     # {"status":"UP"}
```

Point the app at it with `EXPO_PUBLIC_API_URL=http://<your LAN ip>:8080` (an
Android emulator reaches the host at `10.0.2.2`).

## Run the tests

```bash
cd backend
./gradlew test
```

Docker must be running: the suite starts one `postgres:16` container for the
whole run and migrates it from scratch, which is also the only check `V1` and
`V2` can get — a migration is never edited once it has been applied.

## Configuration

Everything is an environment variable, and the defaults in `application.yml`
match `docker-compose.yml`, so local development needs none of them set. The
full table — what each one is, its development default, and which are required
in production — is [`DEPLOY.md`](DEPLOY.md) section 8. That is the single
source; it is not copied back here.

The one worth knowing before you read it: `BRAND_JWT_SECRET` is base64 of at
least 32 bytes, and the app refuses to start without it outside the `dev`
profile.

```bash
openssl rand -base64 32
```

## Deploying it

[`DEPLOY.md`](DEPLOY.md) is the runbook: prerequisites, first deploy, the
bootstrap admin [B11], backups with a tested restore, updates, logs, and what
rotating the JWT secret costs. The pieces it drives are `Dockerfile`,
`src/main/resources/application-prod.yml` and `deploy/` (the production compose
file, the Caddyfile and `.env.example`).

## What is here so far

Build step **B-1**, first wave: the Gradle project, Compose Postgres, the
complete stage-1 schema (`V1__schema.sql`) and the ESN reference data
(`V2__reference_data.sql`), the error contract **[B14]**, `TextNormalizer`,
JWT + refresh rotation **[B3]**, the approved-member guard, and `/auth/*`
including the server-rendered password-reset pages.

`/me`, `/me/profile`, `/me/photo`, `/sections` and the admin page are the second
wave of the same step.

## Rules that are not negotiable here

- **Flyway migrations are only added to.** An applied migration is never edited —
  a wrong column is a new `V`-numbered file.
- **No DTO ever carries `sender_id` or a hint value** the viewer was not allowed.
  Anonymity is a display rule; the server always knows the sender.
- **Nothing is ever seeded but countries and sections** (product principle 4).
- **No password and no token is ever logged.** The one exception is the reset
  link while `brand.mail.enabled` is false, which is a pre-launch affordance and
  says so in the log line.

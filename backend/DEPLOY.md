# Deploying the [BRAND] backend

One VM, four containers: Postgres, the API, a Caddy proxy that terminates TLS,
and a nightly `pg_dump`. Everything here lives in `backend/deploy/`.

- The image is `backend/Dockerfile`. Its build context is the **repository
  root**, because the backend build copies `../admin/index.html` into the jar
  **[B11]** — a context that stopped at `backend/` would produce an image whose
  `/admin/` is a 404.
- The running profile is `prod` (`application-prod.yml`). No value in it has a
  default: a variable you forgot stops the API at startup instead of silently
  running on a development value.

---

## 1. Prerequisites

1. A Linux VM with Docker Engine and the Compose plugin. Two vCPU and 2 GB of
   RAM is enough for one event. The image sets no `-Xmx`: it runs
   `-XX:MaxRAMPercentage=75`, so the heap is 75 % of the **container** limit, and
   with no container limit that is 75 % of the whole VM — 1.5 GB on a 2 GB box,
   which leaves nothing for Postgres, Caddy and the kernel. So on a 2 GB VM give
   the api container `mem_limit: 1g` (it is in `docker-compose.prod.yml`), which
   lands the heap at **~768 MB** — the load check peaked at 221 MB of heap and
   595 MB RSS with 300 members on a live board, so 768 MB is generous. On a
   bigger VM raise or drop `mem_limit` and the heap follows; only override
   `MaxRAMPercentage` if you want something other than three quarters.
2. A domain name with an `A` record pointing at the VM's public IP. Certificates
   are Caddy's job and need nothing from you, but DNS has to resolve first.
3. Ports **80** and **443** open to the internet. Nothing else: Postgres and the
   API sit on an internal Docker network and publish no host port.
4. `git`, to clone this repository onto the VM.

## 2. First deploy

```bash
git clone <repo> brand && cd brand/backend/deploy
cp .env.example .env
openssl rand -base64 32        # BRAND_JWT_SECRET
openssl rand -base64 32        # BRAND_DB_PASSWORD
$EDITOR .env                   # fill in every line; the table is in section 8
```

Then build the image on the VM and start everything:

```bash
docker compose -f docker-compose.prod.yml build api
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml logs -f api
```

To run a published image instead of building on the VM, set `BRAND_IMAGE` in
`.env` to the GHCR tag CI pushed and skip the `build` line (section 6).

Flyway migrates the empty database on the first start; the log says
`Successfully applied 3 migrations`. Once it reaches `Started Application`,
check it from your laptop:

```bash
curl https://<your domain>/actuator/health     # {"status":"UP"}
curl -I https://<your domain>/admin/           # 200, text/html
```

`docker compose -f docker-compose.prod.yml ps` should show `db` and `api` as
`healthy`.

## 3. The first admin

There is no seeded account — nothing is ever seeded but countries and sections.
The first `super_admin` is made by configuration **[B11]**:

1. `BRAND_BOOTSTRAP_ADMIN_EMAIL` in `.env` is the founder's email address.
2. Register that address **in the app** (or with `POST /auth/register`). The new
   account is `pending` like anyone else's.
3. Restart the API once:
   `docker compose -f docker-compose.prod.yml restart api`.
   On start it promotes that account to `super_admin` and approves it, and says
   so: `[B11] promoted <id> to super_admin and approved the account`.
4. Sign in at `https://<your domain>/admin/` with the same credentials and
   approve the other registrations from there.

Before that account exists the log line is
`no account for the bootstrap admin address yet`, which is the expected state on
the very first start, not an error.

## 4. Backups

The `backup` service is a `postgres:16` container that sleeps until
`BRAND_BACKUP_HOUR` (UTC, `03` by default) and then writes two files into
`BRAND_BACKUP_DIR` on the host (`./backups`):

- `brand-<timestamp>.dump` — `pg_dump --format=custom` of the whole database.
- `avatars-<timestamp>.tar.gz` — the avatar volume **[B10]**. Avatars are files
  on disk, not rows; a database dump alone restores an app with no photos.

Both are deleted after `BRAND_BACKUP_RETENTION_DAYS` (14). Check it is running:

```bash
docker compose -f docker-compose.prod.yml logs backup
ls -l backups/
```

Copy that directory off the VM — a backup on the same disk is not a backup:

```bash
rsync -az --delete <vm>:/srv/brand/backend/deploy/backups/ /local/brand-backups/
```

If you would rather not run the container, the same job from host cron is:

```cron
0 3 * * * cd /srv/brand/backend/deploy && docker compose -f docker-compose.prod.yml exec -T db pg_dump -U brand -Fc brand > backups/brand-$(date -u +\%FT\%H\%M).dump
```

### Restoring (test this before you need it)

```bash
cd backend/deploy

# 1. Stop everything that writes.
docker compose -f docker-compose.prod.yml stop api backup

# 2. Throw the data volume away and let Postgres initialise a fresh one.
docker compose -f docker-compose.prod.yml rm -sf db
docker volume rm brand_db-data
docker compose -f docker-compose.prod.yml up -d db

# 3. Restore into it. --clean --if-exists makes the restore repeatable.
docker compose -f docker-compose.prod.yml exec -T db \
  pg_restore -U brand -d brand --clean --if-exists < backups/brand-<timestamp>.dump

# 4. Avatars.
docker run --rm -v brand_avatars:/data -v "$PWD/backups:/backups" alpine \
  sh -c 'rm -rf /data/avatars && tar -xzf /backups/avatars-<timestamp>.tar.gz -C /data'

# 5. Back up.
docker compose -f docker-compose.prod.yml up -d
curl https://<your domain>/actuator/health
```

The API validates the schema against the entities at startup
(`ddl-auto: validate`), so a restore that produced the wrong schema fails loudly
instead of running on it.

## 5. Updating

```bash
cd brand && git pull
cd backend/deploy
docker compose -f docker-compose.prod.yml build api      # or: ... pull api
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml logs -f api
```

`up -d` recreates only what changed. Flyway runs the new migrations on start;
there is nothing to run by hand.

**Migrations are only ever added.** An applied migration is never edited — a
wrong column is a new `V`-numbered file. Flyway checksums what it applied and
refuses to start if a file it has already run has changed.

Take a backup before an update that carries a migration. Rolling one back is the
restore in section 4, not `docker compose down`.

## 6. Images from CI

`.github/workflows/backend.yml` builds the image on every push, as a check. On a
`v*` tag it also pushes it to GHCR as
`ghcr.io/<owner>/<repo>/brand-api:<version>`, using the workflow's own
`GITHUB_TOKEN` — there are no registry credentials to manage.

```bash
git tag v1.0.0 && git push origin v1.0.0
```

Then on the VM set `BRAND_IMAGE=ghcr.io/<owner>/<repo>/brand-api:1.0.0` in
`.env` and run `docker compose -f docker-compose.prod.yml up -d api`. A private
package needs `docker login ghcr.io` on the VM first.

## 7. Day to day

```bash
docker compose -f docker-compose.prod.yml logs -f api        # application log
docker compose -f docker-compose.prod.yml logs -f proxy      # requests, TLS
docker compose -f docker-compose.prod.yml ps                 # health
docker compose -f docker-compose.prod.yml exec db psql -U brand brand
docker compose -f docker-compose.prod.yml restart api
```

The application logs at INFO and never at DEBUG: DEBUG here would put request
bodies and screening decisions into the log, and the log is not a place for
other people's messages. No password and no token is ever logged.

### Rotating `BRAND_JWT_SECRET`

Access tokens are signed with it, so changing it **signs every device out**:
everyone has to log in again, and the app shows them the sign-in screen rather
than an error. Nothing else is lost.

```bash
openssl rand -base64 32          # put it in .env
docker compose -f docker-compose.prod.yml up -d api
```

Do it if the secret has ever been in a chat message, a screenshot, a CI log or a
committed file. Do not do it casually during an event.

### When the API will not start

The prod profile has no fallbacks, so the common failure is a missing variable
and it names the one it wants:

- `Could not resolve placeholder 'BRAND_…'` — that line is missing from `.env`.
- `brand.jwt.secret is not set. Set BRAND_JWT_SECRET to a base64 value of at
  least 32 bytes` — exactly what it says; `openssl rand -base64 32`.
- `Validation failed for ... flyway_schema_history` — a migration file changed
  after it had been applied. Restore the file; never edit an applied migration.

## 8. Environment variables

This table is the one source; `backend/deploy/.env.example` is the copy you edit
and carries the same list with comments. "dev default" is what `application.yml`
falls back to when you run locally with `./gradlew bootRun` — **the prod profile
has no defaults at all**, so every row without one is required.

| Variable | dev default | What it is |
| --- | --- | --- |
| `BRAND_DOMAIN` | — | The site address Caddy serves: `app.example.com` for automatic HTTPS, or `http://localhost` (with the scheme) to test locally over plain HTTP. |
| `BRAND_HTTP_PORT` / `BRAND_HTTPS_PORT` | `80` / `443` | Host ports the proxy publishes. Only change them to test on a busy machine. |
| `BRAND_PUBLIC_BASE_URL` | `http://localhost:8080` | Absolute base of this server. Avatar URLs and the password-reset link are built from it, so it must be an address a phone can open. |
| `BRAND_JWT_SECRET` | dev-only value in `application-dev.yml` | Base64, **≥ 32 bytes decoded**: `openssl rand -base64 32`. The app refuses to start without it; rotating it signs everyone out. |
| `BRAND_BOOTSTRAP_ADMIN_EMAIL` | *(empty)* | **[B11]** the account with this email is promoted to `super_admin` and approved on startup. Section 3. |
| `BRAND_CORS_ALLOWED_ORIGINS` | Expo dev servers | Comma-separated browser origins. The native app sends no `Origin`, so this is the admin page and anything web. Never a wildcard. |
| `BRAND_IMAGE` | *(build locally)* | Optional. A GHCR tag to run instead of building on the VM. Section 6. |
| `BRAND_DB_NAME` / `BRAND_DB_USER` / `BRAND_DB_PASSWORD` | `brand` / `brand` / `brand` | Postgres. The password is a generated secret in production. |
| `BRAND_DB_HOST` / `BRAND_DB_PORT` | `localhost` / `5432` | Set to `db` / `5432` by the compose file; not something you put in `.env`. |
| `BRAND_DB_POOL_SIZE` | `10` | Hikari ceiling. 10 is right for one small VM. |
| `BRAND_MAIL_FROM` | `no-reply@localhost` | From address on the password-reset mail. |
| `BRAND_MAIL_ENABLED` | `false` | `false` **writes the reset link to the log at INFO** instead of sending it. A pre-launch affordance only. |
| `SPRING_MAIL_HOST` / `_PORT` / `_USERNAME` / `_PASSWORD` | *(unset)* | SMTP, read straight from the environment by Spring. Leave them **commented out** until you have credentials: an empty host still creates a mail sender, which then fails at send time. |
| `BRAND_PUSH_ENABLED` | `false` | **[B8]** `false` still writes the outbox and renders the copy; it hands the rows to the logging sender instead of Expo. |
| `BRAND_EXPO_ACCESS_TOKEN` | *(empty)* | From expo.dev. Blank sends the requests unauthenticated, which Expo allows until the project turns enhanced security on. |
| `BRAND_BACKUP_DIR` | `./backups` | Host directory the nightly dump and the avatar tarball land in. |
| `BRAND_BACKUP_HOUR` | `03` | Hour of the day, UTC, two digits. |
| `BRAND_BACKUP_RETENTION_DAYS` | `14` | Dumps older than this are deleted. |

Fixed by `application-prod.yml` and deliberately *not* environment variables:
`brand.media.dir` is `/data/avatars` (a volume), `brand.housekeeping.enabled` is
`true`, Flyway is on, `ddl-auto` is `validate`, actuator exposes health only with
no details, and logging is INFO.

The rate limits and the entitlement flags **[D3]** keep the defaults from
`application.yml`. The entitlement gates are OFF in stages 1–2, and flipping one
is a product decision, not a deployment setting.

## 9. Testing the whole stack locally

The same compose file runs on a laptop over plain HTTP, which is how to check a
change to the Dockerfile or the proxy without a domain:

```bash
cd backend/deploy
cp .env.example .env
# in .env:
#   BRAND_DOMAIN=http://localhost        <- the scheme turns automatic HTTPS off
#   BRAND_HTTP_PORT=8085                 <- anything free
#   BRAND_PUBLIC_BASE_URL=http://localhost:8085
#   BRAND_JWT_SECRET=<openssl rand -base64 32>
docker compose -p brandlocal -f docker-compose.prod.yml up -d --build
curl http://localhost:8085/actuator/health
docker compose -p brandlocal -f docker-compose.prod.yml down -v   # -v discards the data
```

`-p brandlocal` keeps those volumes away from anything named `brand`.

# Load check — one live board, a few hundred phones

`board-load.js` is a [k6](https://k6.io) script that reproduces what a national
event looks like from the server's side: 300 approved members on one live board,
each polling `GET /events/{id}/board` every 5 s and `GET /me/inbox` every 15 s,
each holding one STOMP-over-WebSocket connection subscribed to
`/topic/events/{id}/board` and `/user/queue/events/{id}`, with a reaction about
once a minute and a room post from 5 % of them about once a minute.

It builds everything it needs through the public API — register, `PUT /me/profile`,
admin approve, create event, join, seed the board — so it is a check of the real
routes, not of a fixture.

**It never touches the development database.** It runs against a throwaway
Postgres on 5433 and a server on 8090, both of which you start and throw away.

## Run it

Nothing to install but Docker.

```bash
# 1. throwaway database
docker run -d --name brand-load-pg -p 5433:5432 \
  -e POSTGRES_DB=brand -e POSTGRES_USER=brand -e POSTGRES_PASSWORD=brand postgres:16

# 2. the server, on 8090, with a small-VM heap ceiling
cd backend
./gradlew bootJar
BRAND_DB_PORT=5433 SERVER_PORT=8090 BRAND_PUBLIC_BASE_URL=http://localhost:8090 \
BRAND_BOOTSTRAP_ADMIN_EMAIL=load-admin@brand.test \
BRAND_JWT_SECRET="$(openssl rand -base64 32)" \
MANAGEMENT_ENDPOINTS_WEB_EXPOSURE_INCLUDE=health,metrics \
SERVER_TOMCAT_MBEANREGISTRY_ENABLED=true \
java -Xmx1g -jar build/libs/brand-backend-0.1.0-SNAPSHOT.jar

# 3. the bootstrap admin. Register it, then either restart the server (AdminBootstrap
#    promotes it on the next start) or promote it on the throwaway database:
curl -s localhost:8090/auth/register -H 'content-type: application/json' \
  -d '{"email":"load-admin@brand.test","password":"LoadTest12345"}' > /dev/null
docker exec brand-load-pg psql -U brand -d brand \
  -c "update app_user set role='super_admin', status='approved' where email='load-admin@brand.test'"

# 4. the run
docker run --rm -v "$PWD/loadtest:/scripts" \
  -e BASE_URL=http://host.docker.internal:8090 \
  grafana/k6 run --summary-trend-stats="avg,min,med,max,p(50),p(90),p(95),p(99)" \
  /scripts/board-load.js

# 5. throw it away
docker rm -f brand-load-pg   # and kill the java process on 8090
```

### Knobs

| env | default | what it changes |
| --- | --- | --- |
| `BASE_URL` | `http://host.docker.internal:8090` | the server under test |
| `MEMBERS` | `300` | members on the board; also the VU count of each scenario |
| `RAMP_MS` / `HOLD_MS` | `30000` / `180000` | ramp and hold |
| `BOARD_EVERY_MS` / `INBOX_EVERY_MS` | `5000` / `15000` | the app's poll intervals. Lower them to push the same members harder. |
| `ACTION_EVERY_MS` | `60000` | how often a phone reacts, or posts if it is one of the 5 % |
| `SEED_POSTS` | `120` | published cards on the board before the load starts |
| `BOARD_MODE` | `post_immediately` | `approve_first` puts room posts in the queue instead |
| `RUN_TAG` | `r1` | goes in the account emails, so two runs do not collide |
| `REUSE` | `false` | `true` logs in the accounts of an earlier run and reuses its live board instead of creating 300 more |

Thresholds: `http_req_duration{name:board}` p95 < 300 ms,
`http_req_duration{name:inbox}` p95 < 300 ms, `http_req_failed{phase:main}`
< 0.5 %. `phase:setup` is tagged separately so the 1 200 account-creation calls
can neither hide a failure nor invent one.

### Watching the server while it runs

`MANAGEMENT_ENDPOINTS_WEB_EXPOSURE_INCLUDE=health,metrics` exposes the metrics
endpoint. It is not public — `SecurityConfig` permits only `/actuator/health`
anonymously — so read it with the admin's bearer token:

```bash
TOKEN=$(curl -s localhost:8090/auth/login -H 'content-type: application/json' \
  -d '{"email":"load-admin@brand.test","password":"LoadTest12345"}' | jq -r .tokens.accessToken)
curl -s -H "Authorization: Bearer $TOKEN" localhost:8090/actuator/metrics/hikaricp.connections.active
curl -s -H "Authorization: Bearer $TOKEN" localhost:8090/actuator/metrics/hikaricp.connections.pending
curl -s -H "Authorization: Bearer $TOKEN" 'localhost:8090/actuator/metrics/jvm.memory.used?tag=area:heap'
curl -s -H "Authorization: Bearer $TOKEN" \
  'localhost:8090/actuator/metrics/http.server.requests?tag=uri:/events/{eventId}/board'
```

`hikaricp.connections.pending` is the number to watch: it is 0 while the server
is comfortable and jumps to ~190 the moment it is not.

## What the numbers were, 2026-09-14

Machine: Windows 11, 16 logical CPUs, 32 GB RAM; the server as a plain
`java -Xmx1g -jar`, Postgres 16 in Docker on the same host, k6 in Docker on the
same host. Everything below is one host, so the CPU figures are the app's own
process time, not a VM's.

### The target run — 300 members, 5 s / 15 s, 3 minutes

**Every threshold passed, with a lot of room.**

| request | count | avg | p50 | p90 | p95 | p99 | max |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `board` | 11 727 | 23.1 ms | 21.0 ms | 31.1 ms | **36.4 ms** | 53.7 ms | 102 ms |
| `inbox` | 3 900 | 4.1 ms | 3.5 ms | 5.4 ms | **7.1 ms** | 13.5 ms | 30 ms |

- **0 failed requests** out of 16 564 in the load phase (and 0 out of 17 887
  including setup). `hikaricp.connections.timeout` stayed at 0.
- ~80 req/s during the hold; 1.2 GB received by k6 in 3.5 minutes — the board
  snapshot is ~90 KB with a 300-person roster on it.
- 300 STOMP connections, 600 subscriptions, 0 refused. 279 452 broker frames
  reached the clients (~990/s): every reaction and post fans out to all 300
  subscribers, and that cost nothing measurable.
- Server-side (`http.server.requests`): board mean 19.6 ms / max 80 ms, inbox
  3.1 ms, reaction 8.9 ms, room post 10.5 ms.
- **Pool**: peak 5 of 10 active, **pending never left 0**, longest acquire
  16 ms. 2.1 connection checkouts per request, 7.7 ms held each.
- **Memory**: heap 79–221 MB of the 1 GB cap, RSS 595 MB. GC: 452 pauses,
  0.59 s total, longest 3 ms. No OOM, nothing close to one.
- **CPU**: 0.78 cores sustained for the app, ~0.13 for Postgres.
- Threads peaked at 146; Tomcat busy threads peaked at 6 of 200.
- Server log: **zero WARN, zero ERROR, zero exceptions**, in this run and every
  other one below.

### Where it stops being comfortable

The board snapshot returns *every* published post and the whole roster on every
poll, so its cost is linear in how long the board has been running. Same 300
members, same 5 s / 15 s cadence, different board sizes:

| posts on the board | board avg | board p95 | app CPU | Postgres CPU | pool peak |
| --- | --- | --- | --- | --- | --- |
| 171 | 23 ms | 36 ms | 0.78 cores | ~0.13 cores | 5/10, 0 pending |
| 492 | 70 ms | 139 ms | 2.16 cores | 0.48 cores | 9/10, 0 pending |

That is ≈ **0.15 ms of server time per published post per poll**, essentially
linear through zero — the 300-person roster is the cheap half. Extrapolating,
p95 reaches the 300 ms threshold at roughly 1 000 posts, and the connection pool
runs out before that, at roughly 550–600.

Pushing the *rate* instead (the same members polling faster) finds the same wall
sooner, and it is not a CPU wall:

| offered | posts | achieved | board p95 | pool | Tomcat busy | app CPU |
| --- | --- | --- | --- | --- | --- | --- |
| 160 req/s (2.5 s / 7.5 s) | 438 | 90 req/s | 2.33 s ✗ | 10/10, 188 pending | 200/200 | 3.6 cores |
| 400 req/s (1 s / 3 s) | 199 | 147 req/s | 1.78 s ✗ | 10/10, 190 pending | 200/200 | 2.5 cores |

When it collapses, all 200 Tomcat threads are parked waiting for one of 10
connections while the box is at 3–4 of its 16 cores. Still **zero errors**: no
5xx, no connection timeouts — just queueing.

Raising `spring.datasource.hikari.maximum-pool-size` to 40 and repeating the
400 req/s run did **not** help — achieved throughput *fell* from 147 to 117
req/s, the pool simply pinned at 40/40 with 159 waiting, and RSS climbed to
1.31 GB. Past the point where the work itself is the limit, more connections
only deepen the contention. Below that point the pool is worth widening: at 492
posts and the ordinary cadence it was already at 9 of 10.

### What to take from it

1. **300 members on a fresh board is not a problem.** p95 36 ms against a
   300 ms budget, under one core, half the pool, a tenth of the heap.
2. **The board read is the only thing that grows.** It was unpaginated; a
   three-hour national event will pass 1 000 cards and the poll is the cost that
   scales with it. Capping the feed (the screen is newest-first anyway) is the
   one change that matters. **Done, 2026-09-14:** the feed now returns the newest
   `brand.limits.board-feed` published cards (default 200) while `postCount`
   stays the full count, so a re-run should show board latency flat past 200
   posts instead of climbing through 500.
3. **`maximum-pool-size: 20`** is cheap insurance while that is true — it is now
   the `prod` default —
   Postgres's default `max_connections` is 100 — but it buys a board size, not a
   rate.
4. **Sizing.** A 2 vCPU / 2 GB instance carries the target scenario on a young
   board (0.9 cores app + database, RSS 600 MB). At a 500-post board the same
   traffic wants ~2.6 cores across the app and Postgres, which is more than a
   2 vCPU box has — fix the read or take 4 vCPU.

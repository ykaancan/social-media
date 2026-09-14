/*
 * [BRAND] backend load check — one live board, a few hundred phones.
 *
 * The shape of the traffic is what the app actually does (app/src/api/http.ts):
 *   - GET  /events/{id}/board   every  5 s   (the board screen's poll)
 *   - GET  /me/inbox            every 15 s   (the Inbox tab badge)
 *   - one STOMP-over-WebSocket connection per phone, subscribed to
 *     /topic/events/{id}/board and /user/queue/events/{id}, 10 s heartbeats
 *   - a reaction roughly once a minute per phone
 *   - a room post roughly once a minute from 5 % of the phones
 *
 * Run it with the Docker image, against a throwaway server (see README.md):
 *   docker run --rm -i -v "$PWD:/scripts" grafana/k6 run /scripts/board-load.js
 *
 * Two scenarios share the same 300 accounts: `phones` does the HTTP polling and
 * `sockets` holds the WebSockets. k6's ws module blocks a VU for the lifetime of
 * the socket, so the two cannot live in one VU — the server still sees exactly
 * 300 pollers and 300 sockets, which is what the question is about.
 */
import http from 'k6/http';
import ws from 'k6/ws';
import exec from 'k6/execution';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

/* ------------------------------------------------------------------ config */

const BASE = __ENV.BASE_URL || 'http://host.docker.internal:8090';
const WS_URL = BASE.replace(/^http/, 'ws') + '/ws';

const MEMBERS = Number(__ENV.MEMBERS || 300);
const RAMP_MS = Number(__ENV.RAMP_MS || 30000);
const HOLD_MS = Number(__ENV.HOLD_MS || 180000);
const SEED_POSTS = Number(__ENV.SEED_POSTS || 120);
const BOARD_MODE = __ENV.BOARD_MODE || 'post_immediately';

const ADMIN_EMAIL = __ENV.ADMIN_EMAIL || 'load-admin@brand.test';
const PASSWORD = __ENV.PASSWORD || 'LoadTest12345';
const EMAIL_PREFIX = __ENV.EMAIL_PREFIX || 'load-u';

/** REUSE=true logs the accounts of an earlier run in instead of creating new ones. */
const REUSE = String(__ENV.REUSE || 'false') === 'true';

const BOARD_EVERY_MS = Number(__ENV.BOARD_EVERY_MS || 5000);
const INBOX_EVERY_MS = Number(__ENV.INBOX_EVERY_MS || 15000);
const ACTION_EVERY_MS = Number(__ENV.ACTION_EVERY_MS || 60000);
/** Share of phones that write to the room during the hold. */
const POSTER_SHARE = 0.05;

/** CLAUDE.md §4.5 "single emoji set" — PostReaction.EMOJI, exactly. */
const EMOJI = ['\u{1F525}', '\u{1F602}', '❤️', '\u{1F440}', '\u{1F633}'];

const wsConnected = new Counter('ws_stomp_connected');
const wsSubscribed = new Counter('ws_stomp_subscribed');
const wsFrames = new Counter('ws_broker_messages');
const wsFailures = new Counter('ws_failures');
const boardPosts = new Counter('board_posts_sent');
const reactions = new Counter('reactions_sent');

export const options = {
  // setup() creates 300 accounts through the public API; bcrypt alone is a
  // minute of that.
  setupTimeout: '20m',
  teardownTimeout: '2m',
  // The VUs never read a body, and not copying 90 KB of board JSON 60 times a
  // second keeps k6 itself out of the measurement. setup() asks for its bodies
  // explicitly with responseType: 'text'.
  discardResponseBodies: true,
  scenarios: {
    phones: {
      executor: 'ramping-vus',
      exec: 'phone',
      startVUs: 0,
      stages: [
        { duration: `${RAMP_MS}ms`, target: MEMBERS },
        { duration: `${HOLD_MS}ms`, target: MEMBERS },
      ],
      gracefulRampDown: '30s',
      gracefulStop: '40s',
    },
    sockets: {
      executor: 'ramping-vus',
      exec: 'socket',
      startVUs: 0,
      stages: [
        { duration: `${RAMP_MS}ms`, target: MEMBERS },
        { duration: `${HOLD_MS}ms`, target: MEMBERS },
      ],
      gracefulRampDown: '30s',
      gracefulStop: '40s',
    },
  },
  thresholds: {
    // The number the question is about.
    'http_req_duration{name:board}': ['p(95)<300'],
    // Only the load phase. setup()'s 1200 account-creation calls are tagged
    // phase:setup and must not be able to hide a failure — or invent one.
    'http_req_failed{phase:main}': ['rate<0.005'],
    'http_req_duration{name:inbox}': ['p(95)<300'],
  },
};

/* ----------------------------------------------------------------- helpers */

function bearer(token, name, extra) {
  const params = {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    tags: Object.assign({ name: name, phase: 'main' }, extra || {}),
  };
  return params;
}

function setupParams(token, name) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return { headers: headers, tags: { name: name, phase: 'setup' }, responseType: 'text' };
}

function must(res, what) {
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`${what} failed: ${res.status} ${String(res.body).slice(0, 300)}`);
  }
  return res.body ? JSON.parse(res.body) : null;
}

/* ------------------------------------------------------------------- setup */

export function setup() {
  const admin = must(
    http.post(`${BASE}/auth/login`, JSON.stringify({ email: ADMIN_EMAIL, password: PASSWORD }),
      setupParams(null, 'setup_login')),
    'admin login');
  if (admin.me.role !== 'super_admin' || admin.me.status !== 'approved') {
    throw new Error(`bootstrap admin is ${admin.me.role}/${admin.me.status}; promote it first (see README)`);
  }
  const adminToken = admin.tokens.accessToken;

  const sections = must(http.get(`${BASE}/sections`, setupParams(adminToken, 'setup_sections')), 'sections');
  if (!sections.length) throw new Error('no sections in the reference data');

  if (REUSE) return reuseSetup();

  // 1. register -> profile -> approve, MEMBERS times.
  const accounts = [];
  for (let i = 0; i < MEMBERS; i++) {
    const email = `${EMAIL_PREFIX}${i}-${__ENV.RUN_TAG || 'r1'}@brand.test`;
    const reg = must(
      http.post(`${BASE}/auth/register`, JSON.stringify({ email: email, password: PASSWORD }),
        setupParams(null, 'setup_register')),
      `register ${email}`);
    const token = reg.tokens.accessToken;
    const section = sections[i % sections.length];
    must(
      http.put(`${BASE}/me/profile`,
        JSON.stringify({ name: `Load User ${i}`, sectionId: section.id, bio: 'load test account' }),
        setupParams(token, 'setup_profile')),
      `profile ${i}`);
    must(
      http.post(`${BASE}/admin/api/users/${reg.me.id}/approve`, null,
        setupParams(adminToken, 'setup_approve')),
      `approve ${i}`);
    accounts.push({ id: reg.me.id, token: token });
  }

  // 2. the first account creates one live board.
  const now = Date.now();
  const event = must(
    http.post(`${BASE}/events`, JSON.stringify({
      name: 'Load Board',
      scope: 'national',
      startsAt: new Date(now - 3600 * 1000).toISOString(),
      endsAt: new Date(now + 6 * 3600 * 1000).toISOString(),
      cover: 'azure',
      boardMode: BOARD_MODE,
    }), setupParams(accounts[0].token, 'setup_create_event')),
    'create event');
  if (event.status !== 'live') throw new Error(`event is ${event.status}, not live`);

  // 3. everyone else joins it.
  for (let i = 1; i < accounts.length; i++) {
    const joined = must(
      http.post(`${BASE}/events/join`, JSON.stringify({ code: event.joinCode }),
        setupParams(accounts[i].token, 'setup_join')),
      `join ${i}`);
    if (!joined.ok) throw new Error(`join ${i} refused: ${joined.reason}`);
  }

  // 4. a board that is not empty. A real board at an event has a hundred-odd
  //    cards on it by the time it is busy, and the snapshot's cost is in the
  //    cards and the roster, so measuring an empty one would measure nothing.
  //    One post per account: no account comes near the anonymous-posts-per-hour
  //    limit, and the senders are spread the way they are at an event.
  const levels = ['named', 'anonymous', 'hint'];
  for (let i = 0; i < Math.min(SEED_POSTS, accounts.length); i++) {
    const level = levels[i % levels.length];
    const body = {
      eventId: event.id,
      text: `Board warm-up card number ${i} — see you at the welcome desk.`,
      anonymityLevel: level,
    };
    if (level === 'hint') body.allowedHints = { section: true, country: false, letter: true };
    must(
      http.post(`${BASE}/events/${event.id}/posts`, JSON.stringify(body),
        setupParams(accounts[i].token, 'setup_seed_post')),
      `seed post ${i}`);
  }

  // 5. the post ids the VUs will react to, read once here so the load phase
  //    never has to parse a 90 KB snapshot.
  const snapshot = must(
    http.get(`${BASE}/events/${event.id}/board`, setupParams(accounts[0].token, 'setup_snapshot')),
    'first snapshot');
  const postIds = snapshot.posts.map((p) => p.id);

  console.log(`setup done: ${accounts.length} members, ${postIds.length} published posts, ` +
    `${snapshot.event.people.length} people on the roster, board mode ${BOARD_MODE}`);

  return {
    eventId: event.id,
    accounts: accounts,
    postIds: postIds,
    // Every VU stops on the same wall clock, so no iteration is cut off
    // mid-request by the executor's graceful stop.
    deadline: Date.now() + RAMP_MS + HOLD_MS + 2000,
  };
}

/**
 * A second run against the accounts and the board the first run built — the way
 * to push the same 300 members harder (BOARD_EVERY_MS=1000, say) without paying
 * for 300 more registrations.
 */
function reuseSetup() {
  const accounts = [];
  for (let i = 0; i < MEMBERS; i++) {
    const email = `${EMAIL_PREFIX}${i}-${__ENV.RUN_TAG || 'r1'}@brand.test`;
    const res = must(
      http.post(`${BASE}/auth/login`, JSON.stringify({ email: email, password: PASSWORD }),
        setupParams(null, 'setup_login')),
      `login ${email}`);
    accounts.push({ id: res.me.id, token: res.tokens.accessToken });
  }
  const events = must(http.get(`${BASE}/events`, setupParams(accounts[0].token, 'setup_events')), 'events');
  const live = events.filter((e) => e.status === 'live');
  if (!live.length) throw new Error('no live board to reuse; run once without REUSE first');
  const event = live[0];
  const snapshot = must(
    http.get(`${BASE}/events/${event.id}/board`, setupParams(accounts[0].token, 'setup_snapshot')),
    'snapshot');
  console.log(`reusing board ${event.id}: ${accounts.length} members, ${snapshot.posts.length} posts, ` +
    `${snapshot.event.people.length} on the roster`);
  return {
    eventId: event.id,
    accounts: accounts,
    postIds: snapshot.posts.map((p) => p.id),
    deadline: Date.now() + RAMP_MS + HOLD_MS + 2000,
  };
}

/* ------------------------------------------------- one VU = one phone (HTTP) */

/**
 * Per-VU, because a k6 VU is its own JS runtime. The first iteration of each VU
 * takes the next index, so the 300 VUs of a scenario map one-to-one onto the
 * 300 accounts.
 */
let myIndex = -1;
function accountIndex() {
  if (myIndex < 0) myIndex = exec.scenario.iterationInTest % MEMBERS;
  return myIndex;
}

export function phone(data) {
  const i = accountIndex();
  const account = data.accounts[i];
  const boardUrl = `${BASE}/events/${data.eventId}/board`;
  const inboxUrl = `${BASE}/me/inbox`;
  const poster = i < Math.round(MEMBERS * POSTER_SHARE);

  if (Date.now() >= data.deadline - 1000) { sleep(1); return; }

  // Phones do not wake up in lockstep; without the jitter 300 polls land in the
  // same millisecond every 5 s and the p95 measures a thundering herd that does
  // not exist.
  const now0 = Date.now();
  let nextBoard = now0 + Math.random() * BOARD_EVERY_MS;
  let nextInbox = now0 + Math.random() * INBOX_EVERY_MS;
  let nextAction = now0 + 10000 + Math.random() * ACTION_EVERY_MS;

  while (Date.now() < data.deadline) {
    const now = Date.now();
    if (now >= nextBoard) {
      http.get(boardUrl, bearer(account.token, 'board'));
      nextBoard = now + BOARD_EVERY_MS;
    }
    if (now >= nextInbox) {
      http.get(inboxUrl, bearer(account.token, 'inbox'));
      nextInbox = now + INBOX_EVERY_MS;
    }
    if (now >= nextAction) {
      if (poster) {
        const body = JSON.stringify({
          eventId: data.eventId,
          text: `Live from the floor at ${new Date().toISOString()} — anyone else here?`,
          anonymityLevel: 'anonymous',
        });
        http.post(`${BASE}/events/${data.eventId}/posts`, body, bearer(account.token, 'post'));
        boardPosts.add(1);
      } else {
        const postId = data.postIds[Math.floor(Math.random() * data.postIds.length)];
        const emoji = EMOJI[Math.floor(Math.random() * EMOJI.length)];
        http.put(`${BASE}/events/${data.eventId}/posts/${postId}/reaction`,
          JSON.stringify({ emoji: emoji }), bearer(account.token, 'react'));
        reactions.add(1);
      }
      nextAction = now + ACTION_EVERY_MS * (0.75 + Math.random() * 0.5);
    }
    sleep(0.2);
  }
}

/* ------------------------------------------ one VU = the same phone's socket */

export function socket(data) {
  const i = accountIndex();
  const account = data.accounts[i];
  const remaining = data.deadline - Date.now();
  if (remaining <= 2000) { sleep(1); return; }

  // STOMP frames are NULL-terminated; this is U+0000, not a space.
  const NUL = String.fromCharCode(0);
  const res = ws.connect(WS_URL, { tags: { name: 'ws', phase: 'main' } }, function (sock) {
    let heartbeat = null;

    sock.on('open', function () {
      // [B3]/[B12] the bearer travels on the STOMP CONNECT frame, not on the
      // handshake: the handshake itself is permitAll.
      sock.send('CONNECT\naccept-version:1.2\nhost:brand\nheart-beat:10000,10000\n' +
        `Authorization:Bearer ${account.token}\n\n${NUL}`);
      // 10 s out on the client side; send a touch early so a slow tick never
      // trips the server's reader.
      heartbeat = sock.setInterval(function () { sock.send('\n'); }, 8000);
      sock.setTimeout(function () { sock.close(); }, remaining);
    });

    sock.on('message', function (msg) {
      if (msg.indexOf('CONNECTED') === 0) {
        wsConnected.add(1);
        sock.send(`SUBSCRIBE\nid:sub-board\ndestination:/topic/events/${data.eventId}/board\n\n${NUL}`);
        sock.send(`SUBSCRIBE\nid:sub-queue\ndestination:/user/queue/events/${data.eventId}\n\n${NUL}`);
        wsSubscribed.add(2);
      } else if (msg.indexOf('MESSAGE') === 0) {
        wsFrames.add(1);
      } else if (msg.indexOf('ERROR') === 0) {
        wsFailures.add(1);
        console.error(`STOMP ERROR: ${msg.slice(0, 200)}`);
        sock.close();
      }
    });

    sock.on('error', function (e) {
      if (e && String(e.error()) !== 'websocket: close sent') {
        wsFailures.add(1);
        console.error(`ws error: ${e.error()}`);
      }
    });

    sock.on('close', function () {
      if (heartbeat) sock.clearInterval(heartbeat);
    });
  });

  check(res, { 'websocket handshake is 101': (r) => r && r.status === 101 });
}

import { people, sections as sectionFixtures } from '../dev/fixtures';
import { normalizeForSearch } from '../utils/text';
import type { InboxMessage, InboxSnapshot, WallSnapshot, MessageSender, SendWallMessage, MessageState, ReportReason } from './messages';

interface StoredMessage {
  id: string; senderId: string; recipientId: string; eventId: string;
  text: string; sender: MessageSender; state: MessageState; createdAt: string;
  deletedAt?: string; pushSuppressed: boolean;
}
import {
  type CreateEventRequest, type EventDetail, type EventSummary, type EventJoinResult,
  ApiError,
  LIMITS,
  type ApiClient,
  type AuthResult,
  type LoginRequest,
  type Me,
  type Person,
  type ProfileRequest,
  type RegisterRequest,
  type SectionDetail,
  type SectionRef,
  type SectionSummary,
  type Tokens,
} from './types';

/**
 * In-memory `ApiClient` for development and tests. It is the onboarding
 * prototype's behaviour, typed: the same nine sections, the same rosters, the
 * same demo approval.
 *
 * It is never used in production — `createApi()` only reaches for it when
 * `EXPO_PUBLIC_API_URL` is unset and `__DEV__` is true.
 *
 * Principle 4 still holds here: the mock's counts are its own fixture counts and
 * the arithmetic on them is honest. Nothing is padded to make a screen look
 * fuller than the data is.
 */

/* ------------------------------------------------------------------ *
 * Seed
 * ------------------------------------------------------------------ */

/**
 * Rosters from `/design/bundle/prototypes/onboarding-app.jsx` (its `SECTIONS`
 * constant), keyed by the fixture section ids. The prototype's roster is a
 * SAMPLE of the section, not all of it — which is why the section page renders
 * "and N more" off `rosterTotal`.
 */
const ROSTERS: Record<string, string[]> = {
  ankara: ['Ece Kara', 'Deniz Aksoy', 'Burak Şen', 'Zeynep Acar', 'Kerem Uslu'],
  izmir: ['Şeyma Kaya', 'Ahmet Yıldız', 'Melis Er'],
  bogazici: ['İrem Doğan', 'Can Özkan'],
  metu: ['Selin Ateş', 'Ozan Demir'],
  bologna: ['Giulia Ferri', 'Marco Riva'],
  milano: ['Sara Conti'],
  sevilla: ['Mateo Ruiz', 'Lucía Ortega'],
  brno: ['Lena Novak', 'Tomáš Král'],
  koln: ['Jonas Weber', 'Mia Schulz'],
};

/** Fixture people already have stable ids; anyone else gets one off their name. */
const ID_BY_NAME = new Map(Object.values(people).map((p) => [p.name, p.id]));

function personId(name: string): string {
  return ID_BY_NAME.get(name) ?? normalizeForSearch(name).replace(/[^a-z0-9]+/g, '-');
}

interface SeedSection {
  ref: SectionRef;
  /** The fixture's own member count, before the signed-in user is added. */
  members: number;
  roster: string[];
}

const SEED: SeedSection[] = sectionFixtures.map((s) => ({
  ref: { id: s.id, name: s.name, country: s.country },
  members: s.members,
  roster: ROSTERS[s.id] ?? [],
}));

/* ------------------------------------------------------------------ *
 * Accounts
 * ------------------------------------------------------------------ */

interface Account {
  id: string;
  email: string;
  password: string;
  phone?: string;
  status: Me['status'];
  role: Me['role'];
  name?: string;
  bio?: string;
  avatarUrl?: string;
  sectionId?: string;
  /** Epoch ms at which the demo admin approves. Undefined = never. */
  approveAt?: number;
}

export interface MockApiOptions {
  /** Test/development policy injection, not a real keyword/model moderation service. */
  screening?: (text: string) => 'allow' | 'warn' | 'block';
  recipientPolicy?: (id: string) => { writingPolicy: 'anyone' | 'named_only' | 'nobody'; mutedWords: string[] };
  /**
   * How long a `pending` account waits before the demo admin approves it.
   * 4000 ms mirrors the prototype's timing.
   *
   * DEV ONLY. It is a demo convenience, never a promise the UI is allowed to
   * make: no screen may say how long review takes, because in production a
   * person looks at every profile by hand.
   */
  approveAfterMs?: number;
  /** Simulated round-trip. Tests pass 0. */
  latencyMs?: number;
}

const emailKey = (email: string) => email.trim().toLowerCase();

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class MockApi implements ApiClient {
  private readonly messages = new Map<string, StoredMessage>();
  private readonly blocks = new Map<string, Set<string>>();
  private readonly reports = new Map<string, { messageId: string; reporterId: string; reason: ReportReason }>();
  private messageSequence = 0;
  private readonly screening: NonNullable<MockApiOptions['screening']>;
  private readonly recipientPolicy: NonNullable<MockApiOptions['recipientPolicy']>;

  private messageDto(row: StoredMessage): InboxMessage {
    return { id: row.id, text: row.text, createdAt: row.createdAt, state: row.state,
      sender: JSON.parse(JSON.stringify(row.sender)) as MessageSender,
      source: { eventId: row.eventId, name: this.events.get(row.eventId)!.request.name }, approvedFromBoard: false };
  }
  private hiddenFrom(row: StoredMessage, viewerId: string): boolean {
    return !!row.deletedAt || !!this.blocks.get(viewerId)?.has(row.senderId);
  }
  private newest(rows: StoredMessage[]): StoredMessage[] {
    return rows.sort((a,b) => b.createdAt.localeCompare(a.createdAt) || Number(b.id.slice(8)) - Number(a.id.slice(8)));
  }
  private ownMessage(id: string): StoredMessage {
    const viewer = this.approvedAccount(), row = this.messages.get(id);
    if (!row || row.recipientId !== viewer.id || this.hiddenFrom(row, viewer.id)) throw new ApiError('unknown', 'message unavailable', 404);
    return row;
  }
  async getInbox(): Promise<InboxSnapshot> {
    await this.wait(); const viewer = this.approvedAccount();
    const rows = this.newest([...this.messages.values()].filter(row => row.recipientId === viewer.id && !this.hiddenFrom(row, viewer.id)));
    const counts = { new: 0, private: 0, approved: 0 };
    rows.forEach(row => counts[row.state]++);
    return { messages: rows.map(row => this.messageDto(row)), counts };
  }
  async getWall(eventId: string, personId: string): Promise<WallSnapshot> {
    await this.wait(); const viewer = this.approvedAccount();
    const event = this.events.get(eventId), account = this.find(personId);
    if (!event?.members.has(viewer.id) || !event.members.has(personId) || !account || account.status !== 'approved') throw new ApiError('unknown', 'wall unavailable', 404);
    const person = this.toMe(account);
    const rows = this.newest([...this.messages.values()].filter(row => row.recipientId === personId && row.state === 'approved' && !this.hiddenFrom(row, viewer.id)));
    return { person: { id: person.id, name: person.name!, section: person.section!, avatarUrl: person.avatarUrl, bio: person.bio },
      messages: rows.map(row => { const { state: _state, ...message } = this.messageDto(row); return message; }), count: rows.length,
      isOwner: viewer.id === personId, writingPolicy: this.recipientPolicy(personId).writingPolicy };
  }
  async screenMessage(text: string): Promise<{ warning: boolean }> {
    await this.wait(); this.approvedAccount();
    if (!text.trim() || text.trim().length > 280) throw new ApiError('validation', 'invalid message', 422);
    return { warning: this.screening(text.trim()) !== 'allow' };
  }
  async sendWallMessage(input: SendWallMessage): Promise<{ accepted: true }> {
    await this.wait(); const viewer = this.approvedAccount();
    const recipient = this.find(input.recipientId), event = this.events.get(input.eventId);
    const policy = this.recipientPolicy(input.recipientId);
    if (!recipient || recipient.status !== 'approved' || recipient.id === viewer.id ||
      !event?.members.has(viewer.id) || !event.members.has(recipient.id) ||
      this.blocks.get(recipient.id)?.has(viewer.id) || policy.writingPolicy === 'nobody' ||
      (policy.writingPolicy === 'named_only' && input.anonymityLevel !== 'named')) throw new ApiError('unknown', 'delivery unavailable', 403);
    const text = input.text.trim();
    if (!text || text.length > 280 || !['anonymous','hint','named'].includes(input.anonymityLevel)) throw new ApiError('validation', 'invalid message', 422);
    const screening = this.screening(text);
    if (screening === 'block' || (screening === 'warn' && !input.screeningAcknowledged)) throw new ApiError('unknown', 'delivery unavailable', 422);
    const me = this.toMe(viewer), hints = input.allowedHints;
    if (input.anonymityLevel === 'hint' && !hints.section && !hints.country && !hints.letter) throw new ApiError('validation', 'select a hint', 422);
    const sender: MessageSender = input.anonymityLevel === 'anonymous' ? { level: 'anonymous' } : input.anonymityLevel === 'named'
      ? { level: 'named', name: me.name, avatar: me.avatarUrl }
      : { level: 'hint', hints: { ...(hints.section ? { section: me.section!.name } : {}),
        ...(hints.country ? { country: me.section!.country } : {}), ...(hints.letter ? { letter: Array.from(me.name!)[0] } : {}) } };
    const muted = policy.mutedWords.some(word => !!normalizeForSearch(word) && normalizeForSearch(text).includes(normalizeForSearch(word)));
    const id = `message-${++this.messageSequence}`;
    this.messages.set(id, { id, senderId: viewer.id, recipientId: recipient.id, eventId: event.id, text, sender,
      state: muted ? 'private' : 'new', pushSuppressed: muted, createdAt: new Date().toISOString() });
    return { accepted: true };
  }
  async updateInboxMessage(id: string, state: MessageState): Promise<InboxMessage> {
    await this.wait(); const row = this.ownMessage(id);
    if (!['new','private','approved'].includes(state)) throw new ApiError('validation', 'invalid state', 422);
    row.state = state; return this.messageDto(row);
  }
  async deleteInboxMessage(id: string): Promise<void> {
    await this.wait(); this.ownMessage(id).deletedAt = new Date().toISOString();
  }
  async reportMessage(id: string, reason: ReportReason): Promise<void> {
    await this.wait(); const row = this.ownMessage(id), viewer = this.approvedAccount();
    if (!['harassment','hate','sexual','identity','spam'].includes(reason)) throw new ApiError('validation', 'invalid reason', 422);
    this.reports.set(`${id}:${viewer.id}`, { messageId: row.id, reporterId: viewer.id, reason });
  }
  async blockMessage(id: string): Promise<void> {
    await this.wait(); const row = this.ownMessage(id), viewer = this.approvedAccount();
    const blocked = this.blocks.get(viewer.id) ?? new Set<string>();
    blocked.add(row.senderId); this.blocks.set(viewer.id, blocked);
  }
  private readonly events = new Map<string, {
    request: CreateEventRequest; id: string; creatorId: string; members: Set<string>;
    section: SectionRef; code: string;
  }>();
  private eventSeq = 0;

  private approvedAccount(): Account {
    const account = this.require();
    if (account.status !== 'approved') throw new ApiError('unauthorized', 'approval required', 403);
    return account;
  }

  async listMyEvents(): Promise<EventSummary[]> {
    await this.wait();
    const viewer = this.approvedAccount();
    return [...this.events.values()].filter(e => e.members.has(viewer.id)).map(e => this.eventDto(e, viewer.id));
  }

  async createEvent(request: CreateEventRequest): Promise<EventDetail> {
    await this.wait();
    const viewer = this.approvedAccount();
    const start = Date.parse(request.startsAt), end = Date.parse(request.endsAt);
    if (request.name.trim().length < 2 || request.name.trim().length > 40 ||
      !Number.isFinite(start) || !Number.isFinite(end) || end <= start ||
      !['section', 'national'].includes(request.scope) ||
      !['approve_first', 'post_immediately'].includes(request.boardMode) ||
      !['magenta','coral','tangerine','amber','lime','mint','azure','violet'].includes(request.cover)) {
      throw new ApiError('validation', 'invalid event', 422);
    }
    const section = SEED.find(s => s.ref.id === viewer.sectionId)!.ref;
    const sequence = ++this.eventSeq;
    // Deterministic unique codes for this in-memory mock, never a production generator.
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let n = sequence, code = '';
    for (let i = 0; i < 6; i++) { code = alphabet[n % alphabet.length] + code; n = Math.floor(n / alphabet.length); }
    const event = { request: { ...request, name: request.name.trim() }, id: `event-${sequence}`,
      creatorId: viewer.id, members: new Set([viewer.id]), section, code };
    this.events.set(event.id, event);
    return this.eventDto(event, viewer.id);
  }

  async joinEvent(code: string): Promise<EventJoinResult> {
    await this.wait();
    const viewer = this.approvedAccount();
    const event = [...this.events.values()].find(e => e.code === code.toUpperCase().replace(/[\s-]/g, ''));
    if (!event) return { ok: false, reason: 'not_found' };
    if (event.members.has(viewer.id)) return { ok: false, reason: 'already_joined', eventName: event.request.name };
    event.members.add(viewer.id);
    return { ok: true, event: this.eventDto(event, viewer.id) };
  }

  async getEvent(id: string): Promise<EventDetail> {
    await this.wait();
    const viewer = this.approvedAccount();
    const event = this.events.get(id);
    if (!event || !event.members.has(viewer.id)) throw new ApiError('unknown', 'event unavailable', 404);
    return this.eventDto(event, viewer.id);
  }

  private eventDto(event: { request: CreateEventRequest; id: string; creatorId: string; members: Set<string>; section: SectionRef; code: string }, viewerId: string): EventDetail {
    const people = [...event.members].map(id => this.toMe(this.find(id)!))
      .map(p => ({ id: p.id, name: p.name!, section: p.section!, avatarUrl: p.avatarUrl, bio: p.bio }))
      .sort((a, b) => Number(b.id === viewerId) - Number(a.id === viewerId));
    const now = Date.now();
    return { ...event.request, id: event.id, country: event.section.country,
      section: event.request.scope === 'section' ? { ...event.section } : undefined,
      status: now >= Date.parse(event.request.endsAt) ? 'archived' : now >= Date.parse(event.request.startsAt) ? 'live' : 'upcoming',
      memberCount: people.length, postCount: 0, people, joinCode: event.code, isModerator: event.creatorId === viewerId };
  }
  private readonly approveAfterMs: number;
  private readonly latencyMs: number;
  private readonly accounts = new Map<string, Account>();
  private currentId: string | null = null;
  private unauthorized: (() => void) | undefined;
  private seq = 0;

  constructor(options: MockApiOptions = {}) {
    this.screening = options.screening ?? (() => 'allow');
    this.recipientPolicy = options.recipientPolicy ?? (() => ({ writingPolicy: 'anyone', mutedWords: [] }));
    this.approveAfterMs = options.approveAfterMs ?? 4000;
    this.latencyMs = options.latencyMs ?? 150;
  }

  /* ---------------- tokens ---------------- */

  setTokens(tokens: Tokens | null): void {
    // The mock's access token IS the user id, prefixed. Nothing signs it; it
    // only has to survive a round trip through secure storage.
    this.currentId = tokens ? tokens.accessToken.replace(/^mock\./, '') : null;
  }

  onUnauthorized(cb: () => void): void {
    this.unauthorized = cb;
  }

  /* ---------------- auth ---------------- */

  async register(req: RegisterRequest): Promise<AuthResult> {
    await this.wait();
    const email = req.email.trim();
    if (!LIMITS.emailPattern.test(email)) throw new ApiError('validation', 'invalid email', 422, 'email');
    if (req.password.length < LIMITS.passwordMin) {
      throw new ApiError('validation', 'password too short', 422, 'password');
    }
    if (this.accounts.has(emailKey(email))) {
      throw new ApiError('email_in_use', 'that email already has an account', 409, 'email');
    }

    const account: Account = {
      id: `u${++this.seq}`,
      email,
      password: req.password,
      phone: req.phone,
      status: 'incomplete',
      role: 'member',
    };
    this.accounts.set(emailKey(email), account);
    return this.authResult(account);
  }

  async login(req: LoginRequest): Promise<AuthResult> {
    await this.wait();
    const account = this.accounts.get(emailKey(req.email));
    // Same error for "no such account" and "wrong password" — the real server
    // must not let anyone probe for who has an account.
    if (!account || account.password !== req.password) {
      throw new ApiError('invalid_credentials', 'wrong email or password', 401);
    }
    return this.authResult(account);
  }

  async logout(): Promise<void> {
    await this.wait();
    this.currentId = null;
  }

  async forgotPassword(_email: string): Promise<void> {
    await this.wait();
    // Always resolves, like the real 202: existence is not observable.
  }

  /* ---------------- me ---------------- */

  async me(): Promise<Me> {
    await this.wait();
    return this.toMe(this.require());
  }

  async submitProfile(req: ProfileRequest): Promise<Me> {
    await this.wait();
    const account = this.require();

    const name = req.name.trim();
    if (!name) throw new ApiError('validation', 'name is required', 422, 'name');
    if (name.length > LIMITS.nameMax) throw new ApiError('validation', 'name too long', 422, 'name');
    if ((req.bio?.length ?? 0) > LIMITS.bioMax) throw new ApiError('validation', 'bio too long', 422, 'bio');
    if (!SEED.some((s) => s.ref.id === req.sectionId)) {
      throw new ApiError('validation', 'unknown section', 422, 'sectionId');
    }

    account.name = name;
    account.bio = req.bio?.trim() || undefined;
    account.sectionId = req.sectionId;
    // The real server returns the resized URL from POST /me/photo; the mock has
    // nowhere to put a file, so it hands the local URI straight back.
    if (req.photoUri) account.avatarUrl = req.photoUri;
    // [D7] Resubmitting after a rejection returns to pending, same as the first send.
    account.status = 'pending';
    account.approveAt = Date.now() + this.approveAfterMs;

    return this.toMe(account);
  }

  /* ---------------- sections ---------------- */

  async listSections(): Promise<SectionSummary[]> {
    await this.wait();
    return SEED.map((s) => ({ ...s.ref, memberCount: this.memberCount(s) }));
  }

  async getSection(id: string): Promise<SectionDetail> {
    await this.wait();
    const seed = SEED.find((s) => s.ref.id === id);
    if (!seed) throw new ApiError('unknown', 'no such section', 404);

    const account = this.currentId ? this.find(this.currentId) : undefined;
    const mine = account?.sectionId === id && account.name ? account : undefined;
    // The prototype puts the viewer at the top of their own section's roster.
    const roster: Person[] = [
      ...(mine
        ? [{ id: mine.id, name: mine.name as string, avatarUrl: mine.avatarUrl, section: seed.ref }]
        : []),
      ...seed.roster.map((name) => ({ id: personId(name), name, section: seed.ref })),
    ];

    const memberCount = this.memberCount(seed);
    // rosterTotal === memberCount: the roster is a page of the whole section, so
    // "and N more" is memberCount - roster.length and the viewer, who is in the
    // list, is also in the count. Nobody is counted twice and nobody is free.
    return { ...seed.ref, memberCount, roster, rosterTotal: memberCount };
  }

  /* ---------------- plumbing ---------------- */

  private wait(): Promise<void> {
    return this.latencyMs > 0 ? sleep(this.latencyMs) : Promise.resolve();
  }

  private find(id: string): Account | undefined {
    for (const account of this.accounts.values()) if (account.id === id) return account;
    return undefined;
  }

  private require(): Account {
    const account = this.currentId ? this.find(this.currentId) : undefined;
    if (!account) {
      this.unauthorized?.();
      throw new ApiError('unauthorized', 'not signed in', 401);
    }
    // The demo admin: a pending account flips to approved once its timer is up,
    // and `me()` is the call that notices — which is exactly what the Pending
    // screen polls.
    if (account.status === 'pending' && account.approveAt !== undefined && Date.now() >= account.approveAt) {
      account.status = 'approved';
      account.approveAt = undefined;
    }
    return account;
  }

  /** The viewer counts toward their own section the moment they pick it. */
  private memberCount(seed: SeedSection): number {
    const account = this.currentId ? this.find(this.currentId) : undefined;
    return seed.members + (account?.sectionId === seed.ref.id ? 1 : 0);
  }

  private authResult(account: Account): AuthResult {
    const tokens: Tokens = {
      accessToken: `mock.${account.id}`,
      refreshToken: `mock.refresh.${account.id}`,
    };
    this.currentId = account.id;
    return { tokens, me: this.toMe(account) };
  }

  private toMe(account: Account): Me {
    const seed = SEED.find((s) => s.ref.id === account.sectionId);
    return {
      id: account.id,
      email: account.email,
      status: account.status,
      role: account.role,
      name: account.name,
      bio: account.bio,
      avatarUrl: account.avatarUrl,
      // [D11] The country is only ever reachable through this ref.
      section: seed?.ref,
    };
  }
}

let singleton: MockApi | null = null;

/**
 * The process-wide dev instance, so a Fast Refresh does not sign you out.
 * Tests construct their own `new MockApi({ latencyMs: 0 })` instead.
 */
export function mockApi(options?: MockApiOptions): MockApi {
  singleton ??= new MockApi(options);
  return singleton;
}

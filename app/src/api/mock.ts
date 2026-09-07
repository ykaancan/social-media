import { people, sections as sectionFixtures } from '../dev/fixtures';
import { normalizeForSearch } from '../utils/text';
import {
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
  private readonly approveAfterMs: number;
  private readonly latencyMs: number;
  private readonly accounts = new Map<string, Account>();
  private currentId: string | null = null;
  private unauthorized: (() => void) | undefined;
  private seq = 0;

  constructor(options: MockApiOptions = {}) {
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

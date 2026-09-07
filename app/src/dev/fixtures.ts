/**
 * Dev-only fixtures for the component gallery.
 *
 * The cast, sections and events are copied verbatim from the design bundle's
 * prototype fixtures (`/design/HANDOFF.md` §4) so a gallery screenshot lines up
 * with the web `*.card.html` specimens and with the prototypes.
 *
 * Brief principle 4: none of this is ever seeded into production. It exists so
 * the gallery can render every component in every variant with REAL numbers —
 * counts here are the fixture's own, never invented to fill a card.
 */

import type { CoverName } from '../theme';
import type { PickerPerson, SectionOption } from '../components/patterns';

/* ------------------------------------------------------------------ *
 * People (HANDOFF §4). Every one carries a section, and the country is
 * read through it [D11] — never stored as an independent field.
 * ------------------------------------------------------------------ */

export const people = {
  deniz: { id: 'deniz', name: 'Deniz Aksoy', section: 'ESN Ankara', country: 'Türkiye' },
  kaan: { id: 'kaan', name: 'Kaan Yılmaz', section: 'ESN İzmir', country: 'Türkiye' },
  seyma: { id: 'seyma', name: 'Şeyma Kaya', section: 'ESN İzmir', country: 'Türkiye' },
  giulia: { id: 'giulia', name: 'Giulia Ferri', section: 'ESN Bologna', country: 'Italy' },
  ahmet: { id: 'ahmet', name: 'Ahmet Yıldız', section: 'ESN İzmir', country: 'Türkiye' },
  lena: { id: 'lena', name: 'Lena Novak', section: 'ESN Brno', country: 'Czechia' },
  irem: { id: 'irem', name: 'İrem Doğan', section: 'ESN Boğaziçi', country: 'Türkiye' },
  mateo: { id: 'mateo', name: 'Mateo Ruiz', section: 'ESN Sevilla', country: 'Spain' },
  ece: { id: 'ece', name: 'Ece Kara', section: 'ESN Ankara', country: 'Türkiye' },
  jonas: { id: 'jonas', name: 'Jonas Weber', section: 'ESN Köln', country: 'Germany' },
  burak: { id: 'burak', name: 'Burak Şen', section: 'ESN METU', country: 'Türkiye' },
  marco: { id: 'marco', name: 'Marco Riva', section: 'ESN Milano', country: 'Italy' },
} satisfies Record<string, PickerPerson>;

/** The default persona every prototype signs in as. */
export const me = people.deniz;

/** The National Platform 2026 roster, in the order the prototypes list it. */
export const roster: PickerPerson[] = [
  people.deniz,
  people.kaan,
  people.seyma,
  people.giulia,
  people.ahmet,
  people.lena,
  people.irem,
  people.mateo,
  people.ece,
  people.jonas,
];

/* ------------------------------------------------------------------ *
 * Sections (HANDOFF §4). Membership tags, not tenants.
 * ------------------------------------------------------------------ */

export const sections: SectionOption[] = [
  { id: 'ankara', name: 'ESN Ankara', country: 'Türkiye', members: 212 },
  { id: 'izmir', name: 'ESN İzmir', country: 'Türkiye', members: 148 },
  { id: 'bogazici', name: 'ESN Boğaziçi', country: 'Türkiye', members: 176 },
  { id: 'metu', name: 'ESN METU', country: 'Türkiye', members: 131 },
  { id: 'bologna', name: 'ESN Bologna', country: 'Italy', members: 264 },
  { id: 'milano', name: 'ESN Milano', country: 'Italy', members: 310 },
  { id: 'sevilla', name: 'ESN Sevilla', country: 'Spain', members: 198 },
  { id: 'brno', name: 'ESN Brno', country: 'Czechia', members: 122 },
  { id: 'koln', name: 'ESN Köln', country: 'Germany', members: 241 },
];

/* ------------------------------------------------------------------ *
 * Events (HANDOFF §4). Day/month are what the card renders, so they are
 * kept as the prototypes wrote them.
 * ------------------------------------------------------------------ */

export interface EventFixture {
  id: string;
  name: string;
  status: 'live' | 'upcoming' | 'archived';
  cover: CoverName;
  day: string;
  dayEnd?: string;
  month: number;
  monthEnd?: number;
  timeRange?: string;
  scope: string;
  mode: 'approve_first' | 'post_immediately';
  code: string;
  memberCount?: number;
  postCount?: number;
}

export const events: Record<string, EventFixture> = {
  np: {
    id: 'np',
    name: 'National Platform 2026',
    status: 'live',
    cover: 'magenta',
    day: '14',
    dayEnd: '16',
    month: 11,
    timeRange: 'Fri–Sun',
    scope: 'National',
    mode: 'approve_first',
    code: 'NPL026',
    memberCount: 212,
    postCount: 340,
  },
  cap: {
    id: 'cap',
    name: 'Cappadocia Trip',
    status: 'upcoming',
    cover: 'mint',
    day: '30',
    dayEnd: '2',
    month: 11,
    monthEnd: 12,
    timeRange: 'Mon–Wed',
    scope: 'ESN Ankara',
    mode: 'post_immediately',
    code: 'H3LLON',
    memberCount: 38,
  },
  izm: {
    id: 'izm',
    name: 'İzmir Welcome Night',
    status: 'upcoming',
    cover: 'azure',
    day: '22',
    month: 11,
    timeRange: '20:00–01:00',
    scope: 'ESN İzmir',
    mode: 'approve_first',
    code: 'K7Q4ZM',
    memberCount: 48,
  },
  kar: {
    id: 'kar',
    name: 'Ankara Karaoke',
    status: 'archived',
    cover: 'lime',
    day: '03',
    month: 10,
    timeRange: '21:00–01:00',
    scope: 'ESN Ankara',
    mode: 'post_immediately',
    code: 'KAR4OK',
    memberCount: 64,
    postCount: 188,
  },
  reg: {
    id: 'reg',
    name: 'Regional Platform',
    status: 'archived',
    cover: 'violet',
    day: '4',
    dayEnd: '6',
    month: 4,
    timeRange: 'Fri–Sun',
    scope: 'National',
    mode: 'approve_first',
    code: 'REG026',
    postCount: 512,
  },
};

/** Post bodies the prototypes use. Data, not UI copy — never routed through i18n. */
export const posts = {
  speaker: 'Whoever brought the speaker to the bus: legend.',
  speakerTr: 'Otobüse hoparlörü getiren: efsane.',
  karaoke: "you're the reason the karaoke didn't die at 1am 🎤",
  kitchen: 'Shoutout to the kitchen crew, dinner was unreal',
  bus: 'Bus back to the hotel leaves at 02:00 sharp',
  playlist: 'okay your playlist carried the whole bus home',
  // Exactly 164 and 41 characters: cards.card.html's LockedCard specimens pass
  // those two `length` values, and a locked card's metadata is REAL (principle
  // 4), so the bodies behind them have to be that long to the character.
  locked164:
    'whoever organised the bus back from the venue last night deserves a real medal, we were all half asleep and somehow every single one of us still made it home safely',
  locked41: 'you made the whole welcome night honestly',
  jacket: 'Kim o ceketli?',
  thread1: 'hey, that one was about you 👀',
  thread2: 'who is this??',
  thread3: 'ok fine it was me',
} as const;

/**
 * A stand-in "chosen photo" for the gallery's PhotoPicker specimen: a 35-byte
 * 1x1 GIF in `--cover-magenta`, inline so the gallery needs no network and no
 * asset. It is a swatch, not a face — stage 1 has no photo upload, and no real
 * person's picture belongs in a fixture.
 */
export const photoUri =
  'data:image/gif;base64,R0lGODlhAQABAIAAAOpdqQAAACwAAAAAAQABAAACAkQBADs=';

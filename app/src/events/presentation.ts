import type { EventSummary } from '../api/types';
import { buildEventDraft } from '../components/patterns/CreateSheet';
import type { Locale } from '../i18n';

export function eventCard(event: EventSummary, locale: Locale, nationalLabel: string) {
  // [D15]/P9 An event of an organisation without sections has no scope and no
  // country; its scope line is the organisation's name.
  const draft = buildEventDraft({ name: event.name, scope: event.scope ?? 'section', start: new Date(event.startsAt),
    end: new Date(event.endsAt), cover: event.cover, mode: event.boardMode,
    mySection: event.scope ? event.section?.name ?? '' : event.organisation.name,
    nationalLabel: event.country ? `${nationalLabel} · ${event.country}` : nationalLabel, locale });
  return { ...draft, status: event.status, memberCount: event.memberCount, postCount: event.postCount };
}

/** Stable ordering inside each status group: next start first, newest archive first. */
export function sortEvents(events: EventSummary[]) {
  const rank = { live: 0, upcoming: 1, archived: 2 };
  return [...events].sort((a,b) => rank[a.status] - rank[b.status] ||
    (a.status === 'archived' ? Date.parse(b.endsAt) - Date.parse(a.endsAt) : Date.parse(a.startsAt) - Date.parse(b.startsAt)) || a.id.localeCompare(b.id));
}

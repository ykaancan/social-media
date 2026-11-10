import type { ApiClient, EventDetail } from '../api';
import { sanitizeJoinCode } from '../components/patterns/JoinSheet';

/**
 * [D17] `POST /organisations/join` answers with the membership only, not the
 * event it joined. The event is found among the person's own events by its
 * join code, which `GET /events/:id` carries: only events of that organisation
 * are read, one at a time, and the first whose code matches is returned.
 * Undefined when none matches (the caller then just refreshes the list).
 */
export async function findJoinedEvent(api: ApiClient, code: string, organisationId: string): Promise<EventDetail | undefined> {
  const wanted = sanitizeJoinCode(code);
  const candidates = (await api.listMyEvents()).filter(e => e.organisation.id === organisationId);
  for (const candidate of candidates) {
    const detail = await api.getEvent(candidate.id);
    if (sanitizeJoinCode(detail.joinCode) === wanted) return detail;
  }
  return undefined;
}

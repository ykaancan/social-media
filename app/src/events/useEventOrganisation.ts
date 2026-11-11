import { useEffect, useState } from 'react';
import { useApi } from '../api';

/**
 * [D15] The organisation of the event a composer was opened from, which decides
 * the sender's hint section. `known` is used as-is when the caller already has
 * the event (the board). Otherwise the event is read once with `GET /events/:id`.
 *
 * `ready` is false only while that read is in flight. If there is no event, or
 * the read fails, `organisationId` stays undefined — the composer then offers
 * no section or country hint, because it cannot say which section the server
 * would show.
 */
export function useEventOrganisation(eventId: string | undefined, known?: string): { organisationId?: string; ready: boolean } {
  const api = useApi();
  const lookup = !known && Boolean(eventId);
  const [state, setState] = useState<{ organisationId?: string; ready: boolean }>({ ready: !lookup });
  useEffect(() => {
    if (!lookup || !eventId) return;
    let active = true;
    api.getEvent(eventId).then(
      event => { if (active) setState({ organisationId: event.organisation.id, ready: true }); },
      () => { if (active) setState({ ready: true }); },
    );
    return () => { active = false; };
  }, [api, eventId, lookup]);
  return known ? { organisationId: known, ready: true } : state;
}

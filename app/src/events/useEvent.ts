import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useApi, type EventDetail } from '../api';

export function useEvent(id: string) {
  const api = useApi();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    setEvent(null); setError(false);
    const refresh = () => api.getEvent(id).then(data => { if (active) { setEvent(data); setError(false); } })
      .catch(() => { if (active) setError(true); });
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 30000);
    return () => { active = false; clearInterval(timer); };
  }, [api, id, version]));
  return { event, error, retry: () => setVersion(v => v + 1) };
}

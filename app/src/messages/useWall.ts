import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useApi, type WallSnapshot } from '../api';

export function useWall(eventId: string, personId: string) {
  const api = useApi();
  const [wall, setWall] = useState<WallSnapshot | null>(null), [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true, sequence = 0;
    setWall(null); setError(false);
    const load = async () => {
      const request = ++sequence;
      try { const data = await api.getWall(eventId, personId); if (active && sequence === request) { setWall(data); setError(false); } }
      catch { if (active && sequence === request) setError(true); }
    };
    void load(); const timer = setInterval(() => { void load(); }, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [api, eventId, personId, version]));
  return { wall, error, refresh: () => setVersion(value => value + 1) };
}

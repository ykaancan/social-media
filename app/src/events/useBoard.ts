import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useApi, type BoardSnapshot } from '../api';

/** Focus/foreground owns the subscription. Polling reconciles missed invalidations. */
export function useBoard(id: string) {
  const api = useApi();
  const [board, setBoard] = useState<BoardSnapshot | null>(null);
  const [error, setError] = useState(false);
  const sequence = useRef(0), mounted = useRef(false);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    try { const data = await api.getBoard(id);
      if (mounted.current && request === sequence.current) { setBoard(data); setError(false); }
    } catch { if (mounted.current && request === sequence.current) setError(true); }
  }, [api, id]);
  useFocusEffect(useCallback(() => {
    mounted.current = true; setBoard(null); setError(false);
    let unsubscribe: (() => void) | undefined;
    const connect = () => {
      unsubscribe?.(); unsubscribe = undefined;
      try { unsubscribe = api.subscribeBoard(id, () => { void refresh(); }); } catch { /* GET supplies the access error. */ }
      void refresh();
    };
    connect();
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') connect(); else { unsubscribe?.(); unsubscribe = undefined; }
    });
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 5000);
    return () => { mounted.current = false; sequence.current++; unsubscribe?.(); listener.remove(); clearInterval(timer); };
  }, [api, id, refresh]));
  return { board, error, refresh };
}

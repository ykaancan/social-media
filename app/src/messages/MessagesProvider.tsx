import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useApi, type InboxSnapshot } from '../api';
import { useSession } from '../session';

interface MessagesValue { inbox: InboxSnapshot | null; error: boolean; refresh: () => Promise<void> }
const Context = createContext<MessagesValue | null>(null);

/** One authoritative inbox query drives the owner wall, filters and tab badge. */
export function MessagesProvider({ children }: { children: React.ReactNode }) {
  const api = useApi();
  const { me } = useSession();
  const id = me?.id, approved = me?.status === 'approved';
  const [inbox, setInbox] = useState<InboxSnapshot | null>(null);
  const [error, setError] = useState(false);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    if (!approved) return;
    const request = ++sequence.current;
    try { const data = await api.getInbox(); if (sequence.current === request) { setInbox(data); setError(false); } }
    catch { if (sequence.current === request) setError(true); }
  }, [api, approved, id]);
  useEffect(() => {
    setInbox(null); setError(false);
    void refresh();
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 15000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => { sequence.current++; clearInterval(timer); listener.remove(); };
  }, [refresh]);
  const value = useMemo(() => ({ inbox, error, refresh }), [inbox, error, refresh]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useMessages(): MessagesValue {
  const value = useContext(Context);
  if (!value) throw new Error('MessagesProvider is missing');
  return value;
}

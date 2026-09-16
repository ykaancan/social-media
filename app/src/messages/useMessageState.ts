import { useCallback, useRef, useState } from 'react';
import { useApi, type MessageState } from '../api';
import { useToast } from '../components/patterns';
import { useTranslation } from '../i18n';
import { useMessages } from './MessagesProvider';

export function useMessageState() {
  const api = useApi(), toast = useToast();
  const { refresh } = useMessages();
  const { t } = useTranslation();
  const pending = useRef(new Set<string>());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const move = useCallback(async (id: string, state: MessageState) => {
    if (pending.current.has(id)) return;
    pending.current.add(id);
    setPendingIds(new Set(pending.current));
    try { await api.updateInboxMessage(id, state); await refresh();
      toast.show(t(state === 'approved' ? 'inbox.onWall' : state === 'private' ? 'inbox.keptPrivate' : 'messageFlow.markedNew')); }
    catch { toast.show(t('messageFlow.actionError')); }
    finally { pending.current.delete(id); setPendingIds(new Set(pending.current)); }
  }, [api, refresh, t, toast]);
  return { move, pendingIds };
}

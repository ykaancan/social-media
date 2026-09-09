import { useCallback, useRef } from 'react';
import { useApi, type MessageState } from '../api';
import { useToast } from '../components/patterns';
import { useTranslation } from '../i18n';
import { useMessages } from './MessagesProvider';

export function useMessageState() {
  const api = useApi(), toast = useToast();
  const { refresh } = useMessages();
  const { t } = useTranslation();
  const pending = useRef(new Set<string>());
  return useCallback(async (id: string, state: MessageState) => {
    if (pending.current.has(id)) return;
    pending.current.add(id);
    try { await api.updateInboxMessage(id, state); await refresh();
      toast.show(t(state === 'approved' ? 'inbox.onWall' : state === 'private' ? 'inbox.keptPrivate' : 'messageFlow.markedNew')); }
    catch { toast.show(t('messageFlow.actionError')); }
    finally { pending.current.delete(id); }
  }, [api, refresh, t, toast]);
}

import React, { useRef, useState } from 'react';
import { useApi, type InboxMessage, type MessageState, type ReportReason } from '../api';
import { ConfirmSheet, ReportSheet, MoreSheet, inboxMoreItems, useToast } from '../components/patterns';
import { useTranslation } from '../i18n';
import { useMessages } from './MessagesProvider';
import { messagePreview } from './presentation';

/** App-level orchestration; presentation stays in shared sheets. */
export function MessageActions({ message, onClose }: { message: InboxMessage; onClose: () => void }) {
  const api = useApi();
  const { refresh } = useMessages();
  const { t } = useTranslation();
  const toast = useToast();
  const [mode, setMode] = useState('more');
  const [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const running = useRef(false);
  const run = async (action: () => Promise<unknown>, copy: string) => {
    if (running.current) return;
    running.current = true; setBusy(true); setError(false);
    try { await action(); await refresh(); toast.show(copy); onClose(); }
    catch { setError(true); toast.show(t('messageFlow.actionError')); }
    finally { running.current = false; setBusy(false); }
  };
  const move = (state: MessageState) => { void run(() => api.updateInboxMessage(message.id, state), t(state === 'new' ? 'messageFlow.markedNew' : 'inbox.keptPrivate')); };
  if (mode === 'report') return <ReportSheet post={messagePreview(message)} busy={busy} error={error ? t('messageFlow.actionError') : undefined}
    onClose={onClose} onReport={reason => { void run(() => api.reportMessage(message.id, reason as ReportReason), t('report.sent')); }} />;
  if (mode === 'delete' || mode === 'block') return <ConfirmSheet busy={busy} error={error ? t('messageFlow.actionError') : undefined}
    title={t(`messageFlow.${mode}Title`)} body={t(`messageFlow.${mode}Body`)} action={t(`common.${mode}`)} onClose={onClose}
    onConfirm={() => { void run(() => mode === 'delete' ? api.deleteInboxMessage(message.id) : api.blockMessage(message.id),
      t(mode === 'delete' ? 'inbox.deleted' : 'messageFlow.blocked')); }} />;
  const items = inboxMoreItems(message, t).filter(item => item.id !== 'reply'); // Conversations are Step 6.
  if (message.state !== 'new') items.unshift({ id: 'new', icon: 'Inbox', label: t('messageFlow.markNew') });
  return <MoreSheet post={messagePreview(message)} items={items} onClose={onClose} onPick={id => {
    if (busy) return;
    if (id === 'new' || id === 'private') move(id); else { setError(false); setMode(id); }
  }} />;
}

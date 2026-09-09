import React, { useEffect, useState } from 'react';
import { useApi, type AllowedHints, type MessageLevel, type WallSnapshot } from '../api';
import { Composer, LoadState, Sheet, useToast } from '../components';
import { useSession } from '../session';
import { useTranslation } from '../i18n';
import { getPref, setPref } from '../prefs';

interface Choice { level: MessageLevel; hints: AllowedHints }
/** Coordinates the library Composer with account-scoped anonymity preferences. */
export function WallComposer({ wall, eventId, onClose }: { wall: WallSnapshot; eventId: string; onClose: () => void }) {
  const api = useApi(), { me } = useSession(), toast = useToast(), { t } = useTranslation();
  const [choice, setChoice] = useState<Choice | null>(null);
  const key = `anonymity.${me!.id}` as const;
  useEffect(() => {
    let active = true;
    void getPref(key).then(raw => {
      let next: Choice = { level: 'anonymous', hints: { section: true } };
      try {
        const stored = JSON.parse(raw ?? 'null');
        if (stored && ['anonymous','hint','named'].includes(stored.level)) {
          next = { level: stored.level, hints: { section: stored.hints?.section === true, country: stored.hints?.country === true, letter: stored.hints?.letter === true } };
          if (next.level === 'hint' && !Object.values(next.hints).some(Boolean)) next.hints.section = true;
        }
      } catch { /* Corrupt preferences safely fall back to anonymous. */ }
      if (active) setChoice(next);
    });
    return () => { active = false; };
  }, [key]);
  if (!choice) return <Sheet onClose={onClose}><LoadState onRetry={() => undefined} /></Sheet>;
  return <Composer me={{ name: me!.name!, avatar: me!.avatarUrl, section: me!.section!.name, country: me!.section!.country }}
    wallOwner={{ id: wall.person.id, name: wall.person.name, section: wall.person.section.name, avatar: wall.person.avatarUrl }}
    initialLevel={choice.level} initialHintFields={choice.hints} namedOnly={wall.writingPolicy === 'named_only'}
    onLevelChange={(level, hints) => { void setPref(key, JSON.stringify({ level, hints })); }}
    onScreen={text => api.screenMessage(text)} onClose={onClose} onSend={async payload => {
      await api.sendWallMessage({ eventId, recipientId: wall.person.id, text: payload.text, anonymityLevel: payload.sender.level,
        allowedHints: { section: !!payload.sender.hints?.section, country: !!payload.sender.hints?.country, letter: !!payload.sender.hints?.letter },
        screeningAcknowledged: payload.screeningAcknowledged });
      toast.show(t('composer.sentToInbox')); onClose();
    }} />;
}

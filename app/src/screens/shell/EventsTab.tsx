import React, { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useApi, type EventSummary } from '../../api';
import { Avatar, Button, Text } from '../../components/core';
import { EventCard } from '../../components/cards';
import { BottomBar, CoachMark, Empty, Screen, JoinSheet, CreateSheet, EventDatePicker, EventScanner, LoadState, type EventDraft } from '../../components/patterns';
import { useLocale, useTranslation } from '../../i18n';
import type { TabScreenProps } from '../../navigation/types';
import { useCoachMark } from '../../prefs';
import { useSession } from '../../session';
import { eventCard, sortEvents } from '../../events/presentation';

export function EventsTab({ navigation }: TabScreenProps<'Events'>) {
  const { t } = useTranslation();
  const locale = useLocale();
  const { me } = useSession();
  const api = useApi();
  const coach = useCoachMark();
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  const [sheet, setSheet] = useState<'join' | 'create' | null>(null);
  const [start, setStart] = useState(() => new Date(Date.now() + 3600000));
  const [end, setEnd] = useState(() => new Date(Date.now() + 14400000));
  const [pick, setPick] = useState<'start' | 'end' | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [createError, setCreateError] = useState<string>();
  const joinedId = useRef<string | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    const load = () => api.listMyEvents().then(data => { if (active) { setEvents(sortEvents(data)); setError(false); } })
      .catch(() => { if (active) setError(true); });
    void load();
    const timer = setInterval(() => { void load(); }, 30000);
    return () => { active = false; clearInterval(timer); };
  }, [api, version]));
  const create = async (draft: EventDraft) => {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setCreateError(undefined);
    try {
      const event = await api.createEvent({ name: draft.name, scope: draft.scopeKind, startsAt: draft.start.toISOString(),
        endsAt: draft.end.toISOString(), cover: draft.cover, boardMode: draft.mode });
      setSheet(null); setVersion(v => v + 1);
      navigation.navigate('EventCode', { id: event.id, created: true });
    } catch { setCreateError(t('eventFlow.createError')); }
    finally { submitting.current = false; setBusy(false); }
  };
  return <Screen testID="events-screen" header={<View style={styles.header}>
    <Text variant="displayLg" upper>{t('events.title')}</Text>
    <Pressable testID="events-avatar" accessibilityRole="button" accessibilityLabel={t('tabs.profile')} onPress={() => navigation.navigate('Profile')}>
      <Avatar name={me?.name ?? ''} src={me?.avatarUrl} size="sm" />
    </Pressable>
  </View>} bottom={<>
    {coach.visible && events?.length === 0 && !sheet && <CoachMark testID="coach-mark" title={t('onboarding.coachTitle')}
      body={t('onboarding.coachBody')} dismissLabel={t('onboarding.coachDismiss')} onDismiss={coach.dismiss} tailOffset={60} style={styles.coach} />}
    <BottomBar row>
      <View style={styles.join}><Button testID="events-join" size="lg" icon="LogIn" full onPress={() => setSheet('join')}>{t('events.join')}</Button></View>
      <Button testID="events-create" size="lg" variant="secondary" icon="Plus" onPress={() => {
        setStart(new Date(Date.now()+3600000)); setEnd(new Date(Date.now()+14400000)); setPick(null); setCreateError(undefined); setSheet('create');
      }}>{t('events.createShort')}</Button>
    </BottomBar>
    {sheet === 'join' && <JoinSheet onClose={() => { setSheet(null); setVersion(v => v + 1); }}
      renderScanner={onCode => <EventScanner onCode={onCode} />}
      onSubmitCode={async code => {
        const result = await api.joinEvent(code);
        if (!result.ok) return result;
        joinedId.current = result.event.id; setVersion(v => v + 1);
        return { ok: true, event: eventCard(result.event, locale, t('events.national')) };
      }} onOpenEvent={() => { setSheet(null); if (joinedId.current) navigation.navigate('EventDetail', { id: joinedId.current }); }} />}
    {sheet === 'create' && <CreateSheet me={{ section: me?.section?.name ?? '' }} start={start} end={end}
      busy={busy} error={createError} onClose={() => setSheet(null)} onCreate={draft => { void create(draft); }}
      onPickStart={() => setPick('start')} onPickEnd={() => setPick('end')}
      datePicker={pick && <EventDatePicker key={pick} value={pick === 'start' ? start : end}
        onChange={pick === 'start' ? setStart : setEnd} onClose={() => setPick(null)} />} />}
  </>}>
    {error || !events ? <LoadState error={error} onRetry={() => { setError(false); setVersion(v => v + 1); }} /> : events.length === 0 ?
      <Empty testID="events-empty" icon="CalendarDays" text={t('events.empty')} style={styles.empty} /> :
      (['live', 'upcoming', 'archived'] as const).map(status => {
        const group = events.filter(e => e.status === status);
        if (!group.length && status !== 'upcoming') return null;
        return <View key={status} style={styles.group}>
          <Text variant="captionCaps" upper>{t(`events.${status}`)}</Text>
          {group.map(event => <EventCard key={event.id} {...eventCard(event, locale, t('events.national'))}
            compact={status !== 'live'} testID={`event-${event.id}`} onPress={() => navigation.navigate('EventDetail', { id: event.id })} />)}
          {!group.length && <Text>{t('eventFlow.noUpcoming')}</Text>}
        </View>;
      })}
  </Screen>;
}
const styles = StyleSheet.create({ header: { paddingTop: 6, paddingHorizontal: 16, paddingBottom: 12, minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  group: { gap: 12 }, empty: { paddingTop: 88, paddingBottom: 0 }, coach: { position: 'absolute', left: 16, right: 16, bottom: 158, zIndex: 6 }, join: { flex: 1 } });

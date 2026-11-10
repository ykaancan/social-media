import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { isApiError, useApi, type EventSummary, type Membership } from '../../api';
import { Avatar, Button, Text } from '../../components/core';
import { EventCard, PendingState } from '../../components/cards';
import { BottomBar, CoachMark, Empty, Note, Screen, RefreshNotice, TabHeader, JoinSheet, CreateSheet, EventDatePicker, EventScanner, LoadState,
  type CreateOrganisation, type EventDraft, type MembershipAnswer } from '../../components/patterns';
import { useLocale, useTranslation } from '../../i18n';
import type { TabScreenProps } from '../../navigation/types';
import { useCoachMark } from '../../prefs';
import { useSession } from '../../session';
import { eventCard, sortEvents } from '../../events/presentation';
import { findJoinedEvent } from '../../events/findJoinedEvent';

export function EventsTab({ navigation }: TabScreenProps<'Events'>) {
  const { t } = useTranslation();
  const locale = useLocale();
  const { me, refreshMe } = useSession();
  const api = useApi();
  const coach = useCoachMark();
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [sheet, setSheet] = useState<'join' | 'create' | null>(null);
  const [start, setStart] = useState(() => new Date(Date.now() + 3600000));
  const [end, setEnd] = useState(() => new Date(Date.now() + 14400000));
  const [pick, setPick] = useState<'start' | 'end' | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [createError, setCreateError] = useState<string>();
  const joinedId = useRef<string | null>(null);
  // `refreshMe` is rebuilt whenever the session changes; a ref keeps the focus
  // effect from re-running (and re-reading /me) on every refresh it causes.
  const refreshMeRef = useRef(refreshMe);
  useEffect(() => { refreshMeRef.current = refreshMe; }, [refreshMe]);
  const memberships: Membership[] = me?.memberships ?? [];
  // [D16] Only organisations whose membership may create events are offered.
  const creators: CreateOrganisation[] = memberships.filter(m => m.canCreateEvents)
    .map(m => ({ id: m.organisation.id, name: m.organisation.name, hasSections: m.organisation.hasSections, section: m.section?.name }));
  const pending = memberships.filter(m => m.status === 'pending');
  const rejected = memberships.filter(m => m.status === 'rejected');

  const loadEvents = useCallback(() => api.listMyEvents().then(data => { setEvents(sortEvents(data)); setError(false); })
    .catch(() => { setError(true); }), [api]);
  /** [D14] Memberships come from /me: re-read it with the list, so an approval shows without a restart. */
  const reload = useCallback(() => Promise.all([loadEvents(), refreshMeRef.current().catch(() => undefined)]), [loadEvents]);

  useFocusEffect(useCallback(() => {
    let active = true;
    const guarded = () => { if (active) void reload(); };
    guarded();
    const timer = setInterval(() => { if (active) void loadEvents(); }, 30000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') guarded(); });
    return () => { active = false; clearInterval(timer); listener.remove(); };
  }, [reload, loadEvents, version]));

  const pullToRefresh = () => {
    setRefreshing(true);
    void reload().finally(() => setRefreshing(false));
  };

  const create = async (draft: EventDraft, organisation: CreateOrganisation) => {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setCreateError(undefined);
    try {
      const event = await api.createEvent({ organisationId: organisation.id,
        ...(organisation.hasSections ? { scope: draft.scopeKind } : {}), name: draft.name, startsAt: draft.start.toISOString(),
        endsAt: draft.end.toISOString(), cover: draft.cover, boardMode: draft.mode });
      setSheet(null); setVersion(v => v + 1);
      navigation.navigate('EventCode', { id: event.id, created: true });
    } catch (e) {
      // [D16] The organisation's switch changed since /me was read: say so and re-read it.
      if (isApiError(e, 'event_creation_not_allowed')) {
        setCreateError(t('createFlow.notAllowed', { organisation: organisation.name }));
        void refreshMeRef.current().catch(() => undefined);
      } else setCreateError(t('eventFlow.createError'));
    }
    finally { submitting.current = false; setBusy(false); }
  };

  const requestMembership = async (request: { code: string; sectionId?: string }): Promise<MembershipAnswer> => {
    let membership: Membership;
    try {
      membership = await api.requestMembership(request);
    } catch (e) {
      if (isApiError(e, 'validation') && (!e.field || e.field === 'sectionId')) return { status: 'invalid_section' };
      throw e;
    }
    setVersion(v => v + 1);
    void refreshMeRef.current().catch(() => undefined);
    if (membership.status !== 'approved') return { status: 'pending' };
    const event = await findJoinedEvent(api, request.code, membership.organisation.id).catch(() => undefined);
    if (!event) return { status: 'approved' };
    joinedId.current = event.id;
    return { status: 'approved', event: eventCard(event, locale, t('events.national')) };
  };

  return <Screen testID="events-screen" onRefresh={pullToRefresh} refreshing={refreshing} header={<TabHeader title={t('events.title')} right={<>
    <Pressable testID="events-avatar" accessibilityRole="button" accessibilityLabel={t('tabs.profile')} onPress={() => navigation.navigate('Profile')}>
      <Avatar name={me?.name ?? ''} src={me?.avatarUrl} size="sm" />
    </Pressable>
  </>}/>} bottom={<>
    {coach.visible && events?.length === 0 && !sheet && <CoachMark testID="coach-mark" title={t('onboarding.coachTitle')}
      body={t('onboarding.coachBody')} dismissLabel={t('onboarding.coachDismiss')} onDismiss={coach.dismiss} tailOffset={60} style={styles.coach} />}
    <BottomBar row>
      <View style={styles.join}><Button testID="events-join" size="lg" icon="LogIn" full onPress={() => setSheet('join')}>{t('events.join')}</Button></View>
      {creators.length > 0 && <Button testID="events-create" size="lg" variant="secondary" icon="Plus" onPress={() => {
        setStart(new Date(Date.now()+3600000)); setEnd(new Date(Date.now()+14400000)); setPick(null); setCreateError(undefined); setSheet('create');
      }}>{t('events.createShort')}</Button>}
    </BottomBar>
    {sheet === 'join' && <JoinSheet onClose={() => { setSheet(null); setVersion(v => v + 1); }}
      renderScanner={onCode => <EventScanner onCode={onCode} />}
      onSubmitCode={async code => {
        const result = await api.joinEvent(code);
        if (!result.ok) return result;
        joinedId.current = result.event.id; setVersion(v => v + 1);
        return { ok: true, event: eventCard(result.event, locale, t('events.national')) };
      }}
      loadSections={organisationId => api.listOrganisationSections(organisationId)
        .then(list => list.map(s => ({ id: s.id, name: s.name, country: s.country, members: s.memberCount })))}
      onRequestMembership={requestMembership}
      onOpenEvent={() => { setSheet(null); if (joinedId.current) navigation.navigate('EventDetail', { id: joinedId.current }); }} />}
    {sheet === 'create' && <CreateSheet organisations={creators} start={start} end={end}
      busy={busy} error={createError} onClose={() => setSheet(null)} onCreate={(draft, organisation) => { void create(draft, organisation); }}
      onPickStart={() => setPick('start')} onPickEnd={() => setPick('end')}
      datePicker={pick && <EventDatePicker key={pick} value={pick === 'start' ? start : end}
        onChange={pick === 'start' ? setStart : setEnd} onClose={() => setPick(null)} />} />}
  </>}>
    {error && events && <RefreshNotice onRetry={() => setVersion(v => v + 1)}/>}
    {/* [D14]/[D17] One waiting card per pending membership, one note per rejected one. */}
    {pending.map(m => <PendingState key={m.organisation.id} testID={`membership-pending-${m.organisation.id}`}
      title={t('membershipFlow.pendingTitle', { organisation: m.organisation.name })}
      steps={[
        { label: t('membershipFlow.stepSent'), done: true },
        { label: t('membershipFlow.stepReview'), current: true, description: t('membershipFlow.stepReviewDesc', { organisation: m.organisation.name }) },
        { label: t('membershipFlow.stepIn'), description: m.pendingEventName ? t('membershipFlow.stepInEvent', { event: m.pendingEventName }) : undefined },
      ]} />)}
    {rejected.map(m => <Note key={m.organisation.id} testID={`membership-rejected-${m.organisation.id}`}>
      {t('membershipFlow.rejected', { organisation: m.organisation.name })}
    </Note>)}
    {!events ? <LoadState error={error} onRetry={() => { setError(false); setVersion(v => v + 1); }} /> : events.length === 0 ?
      <Empty testID="events-empty" icon="CalendarDays" text={t('events.empty')} style={styles.empty} /> :
      (['live', 'upcoming', 'archived'] as const).map(status => {
        const group = events.filter(e => e.status === status);
        if (!group.length && status !== 'upcoming') return null;
        return <View key={status} style={styles.group}>
          <Text variant="captionCaps" upper>{t(`events.${status}`)}</Text>
          {group.map(event => <EventCard key={event.id} {...eventCard(event, locale, t('events.national'))}
            compact={status !== 'live'} testID={`event-${event.id}`} onPress={() => navigation.navigate('EventDetail', { id: event.id })} />)}
          {!group.length && <Text>{t(creators.length ? 'eventFlow.noUpcoming' : 'eventFlow.noUpcomingJoin')}</Text>}
        </View>;
      })}
  </Screen>;
}
const styles = StyleSheet.create({
  group: { gap: 12 }, empty: { flex: 1, justifyContent: 'center', paddingVertical: 24 }, coach: { position: 'absolute', left: 16, right: 16, bottom: 158, zIndex: 6 }, join: { flex: 1 } });

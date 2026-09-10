import React, { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { AnonymityBadge } from '../../components/anonymity';
import { QueueCard } from '../../components/cards';
import { Button, IconButton, StatusPill, Switch } from '../../components/core';
import {
  Back,
  BlockedRow,
  ChoiceRow,
  ThreadRow,
  ThreadComposer,
  MessageCard,
  UnpublishedPost,
  EventHeader,
  LoadState,
  EventDatePicker,
  EventScanner,
  BottomBar,
  CoachMark,
  CoverStrip,
  Empty,
  Group,
  Note,
  PersonPicker,
  PersonRow,
  PhotoPicker,
  PickerRow,
  Row,
  Screen,
  Swipe,
  TabBar,
  WallHeader,
  Wordmark,
  type PickerPerson,
  type TabId,
} from '../../components/patterns';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../theme';
import { me, photoUri, posts, roster } from '../fixtures';
import { GallerySection, Specimen } from '../kit';
import { PatternSheets } from './PatternSheets';

const OWNER = {
  name: me.name,
  section: me.section,
  country: me.country,
  bio: 'Ankara. Karaoke enthusiast, bad at pub quizzes.',
};

export function PatternsSection({ onLayout }: { onLayout?: (e: LayoutChangeEvent) => void }) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();

  const [tab, setTab] = useState<TabId>('events');
  const [picked, setPicked] = useState<PickerPerson | undefined>(undefined);
  const [notif, setNotif] = useState(true);
  const [swiped, setSwiped] = useState<string | null>(null);
  const [coach, setCoach] = useState(true);
  const [eventTool, setEventTool] = useState<'date' | 'scan' | null>(null);
  const [eventDate, setEventDate] = useState(new Date(2026, 10, 14, 20));

  /** A phone-sized window, so the absolutely-positioned specimens have edges. */
  const frame = [
    styles.frame,
    { backgroundColor: colors.bg, borderColor: colors.border, borderRadius: radius.card },
  ];

  return (
    <GallerySection
      id="patterns"
      title="Patterns"
      subtitle="HANDOFF §2.5 — the 20 recurring patterns the prototypes rebuild inline, on §4 fixtures"
      onLayout={onLayout}
    >
      {(['new', 'private', 'approved'] as const).map(state => (
        <Specimen key={state} label={`MessageCard · ${state}`}>
          <MessageCard message={{id: `gallery-${state}`, text: 'Thank you for a great event.',
            sender: {level: 'anonymous'}, createdAt: new Date().toISOString(),
            approvedFromBoard: false, state}} onMore={() => {}} onStateChange={() => {}} />
        </Specimen>
      ))}
      {(['pending','rejected'] as const).map(state=><Specimen key={state} label={`UnpublishedPost · ${state}`}>
        <UnpublishedPost post={{id:'gallery-'+state,text:'Thank you for a great event.',sender:{level:'anonymous'},createdAt:new Date().toISOString(),state,mine:true,reactions:{}}}
          onRewrite={()=>{}} onDismiss={()=>{}}/>
      </Specimen>)}
      <Specimen label="MessageCard · public wall">
        <MessageCard wall message={{id: 'gallery-wall', text: 'Thank you for a great event.',
          sender: {level: 'hint', hints: {country: 'Türkiye'}}, createdAt: new Date().toISOString(), approvedFromBoard: true}} />
      </Specimen>
      <Specimen label="Empty · plain">
        <Empty icon="Inbox" text={t('inbox.empty')} />
      </Specimen>

      <Specimen label="Empty · tinted with the ambient event colour">
        <Empty icon="MessageSquare" text={t('board.empty')} tint />
      </Specimen>

      <Specimen label="Note · default (Info)">
        <Note>{t('section.tagNote')}</Note>
      </Specimen>

      <Specimen label="Note · TriangleAlert">
        <Note icon="TriangleAlert">{t('composer.screeningDetail')}</Note>
      </Specimen>

      <Specimen label="Group of Rows · Settings root · Privacy (values)">
        <Group label={t('settings.title')}>
          <Row
            icon="MessageSquareLock"
            label={t('settings.whoCanWrite')}
            value={t('settings.anyone')}
            onPress={() => undefined}
          />
          <Row icon="Ban" label={t('settings.blocked')} value="2" onPress={() => undefined} />
          <Row icon="VolumeX" label={t('settings.mutedWords')} value="5" onPress={() => undefined} />
          <Row
            icon="Bell"
            label={t('settings.notifications')}
            right={<Switch checked={notif} onChange={setNotif} />}
          />
          <Row icon="Languages" label={t('settings.language')} value="English" onPress={() => undefined} />
        </Group>
      </Specimen>

      <Specimen label="Group of Rows · Account · description + danger row">
        <Group label="Account">
          <Row icon="UserPen" label="Edit profile" onPress={() => undefined} />
          <Row
            icon="MapPin"
            label={t('settings.mySection')}
            value={me.section}
            description="Once every 30 days"
            onPress={() => undefined}
          />
          <Row icon="LogOut" label="Log out" onPress={() => undefined} />
          <Row icon="Trash2" label={t('settings.deleteAccount')} danger onPress={() => undefined} />
        </Group>
      </Specimen>

      <Specimen label="Group of Rows · Legal · external chevrons">
        <Group label="Legal">
          <Row
            icon="Shield"
            label="Privacy policy"
            value="Opens in your browser"
            external
            onPress={() => undefined}
          />
          <Row
            icon="FileText"
            label="Terms of use"
            value="Opens in your browser"
            external
            onPress={() => undefined}
          />
        </Group>
      </Specimen>

      <Specimen label="Group of PersonRows · roster · `· you` on the owner · right slot">
        <Group label={t('events.members', { n: roster.length })}>
          {roster.slice(0, 6).map((p) => (
            <PersonRow
              key={p.id}
              person={p}
              me={p.id === me.id}
              sub={p.country ? `${p.section} · ${p.country}` : p.section}
              onPress={() => undefined}
            />
          ))}
          <PersonRow
            person={roster[6]!}
            sub={roster[6]!.section}
            right={<StatusPill status="pending" />}
          />
        </Group>
      </Specimen>

      <Specimen label="Back · with title">
        <Back title={t('settings.title')} onBack={() => undefined} />
      </Specimen>

      <Specimen label="Back · no title">
        <Back onBack={() => undefined} />
      </Specimen>

      <Specimen label="Back · title + right slot">
        <Back
          title={t('events.board')}
          onBack={() => undefined}
          right={<IconButton icon="Settings2" label={t('events.boardControls')} variant="outline" />}
        />
      </Specimen>

      {/* The scaffold is the one specimen that has to be shown inside a window:
          Screen fills its parent and BottomBar pins itself to the bottom of it.
          The nested SafeAreaView pads the top a second time in here (the gallery
          already ate the real inset) — on a real screen there is only one. */}
      <Specimen label="Screen · header + body (gap 16, pad 4/16/130) + BottomBar, in a 300px window">
        <View style={frame}>
          <Screen
            header={<Back title={t('onboarding.profileTitle')} onBack={() => undefined} />}
            bottom={
              <BottomBar>
                <Button size="lg" full icon="Send">
                  {t('common.next')}
                </Button>
              </BottomBar>
            }
          >
            <Note>{t('onboarding.sectionHint')}</Note>
            <Note icon="Lock">{t('onboarding.countryFromSection')}</Note>
          </Screen>
        </View>
      </Specimen>

      <Specimen label="BottomBar · column (splash: one primary + one ghost)">
        <View style={frame}>
          <BottomBar>
            <Button size="lg" full>
              {t('onboarding.signUp')}
            </Button>
            <Button size="lg" full variant="ghost">
              {t('onboarding.logIn')}
            </Button>
          </BottomBar>
        </View>
      </Specimen>

      <Specimen label="BottomBar · row (events: Join fills, Create hugs)">
        <View style={frame}>
          <BottomBar row>
            {/* Button's `style` lands on its inner box, so the flex weight goes
                on a wrapper — the Pressable is what the row lays out. */}
            <View style={styles.grow}>
              <Button size="lg" full icon="LogIn">
                {t('events.join')}
              </Button>
            </View>
            <Button size="lg" variant="secondary" icon="Plus">
              {t('events.create')}
            </Button>
          </BottomBar>
        </View>
      </Specimen>

      <Specimen label="Wordmark · plain (splash, --display-xl)">
        <Wordmark />
      </Specimen>

      <Specimen label="Wordmark · plain sm (the pending header)">
        <Wordmark size="sm" />
      </Specimen>

      <Specimen label="Wordmark · inverse / lime blocks (--display-md)">
        <Wordmark treatment="inverse" />
        <Wordmark treatment="lime" />
      </Specimen>

      <Specimen label="CoverStrip · md (splash, 22x6)">
        <CoverStrip />
      </Specimen>

      <Specimen label="CoverStrip · sm, centered (sign-up, 14x6)">
        <CoverStrip size="sm" centered />
      </Specimen>

      <Specimen label="PhotoPicker · empty (dashed, Camera + Plus badge)">
        <PhotoPicker
          label={t('onboarding.photo')}
          hint={t('onboarding.photoHint')}
          onPress={() => undefined}
        />
      </Specimen>

      <Specimen label="PhotoPicker · chosen (Avatar + Pencil badge)">
        <PhotoPicker
          uri={photoUri}
          name={me.name}
          label={t('onboarding.photo')}
          hint={t('onboarding.photoHint')}
          onPress={() => undefined}
        />
      </Specimen>

      <Specimen label="PickerRow · empty (placeholder in text-3)">
        <PickerRow
          label={t('onboarding.section')}
          icon="MapPin"
          placeholder={t('onboarding.pickSection')}
          hint={t('onboarding.sectionHint')}
          onPress={() => undefined}
        />
      </Specimen>

      <Specimen label="PickerRow · filled">
        <PickerRow
          label={t('onboarding.section')}
          icon="MapPin"
          value={me.section}
          placeholder={t('onboarding.pickSection')}
          hint={t('onboarding.sectionHint')}
          onPress={() => undefined}
        />
      </Specimen>

      <Specimen label="PickerRow · locked, empty ([D11] country waits on the section)">
        <PickerRow
          locked
          label={t('onboarding.country')}
          icon="Flag"
          placeholder={t('onboarding.countryFromSection')}
        />
      </Specimen>

      <Specimen label="PickerRow · locked, filled (Lock appears with the value)">
        <PickerRow
          locked
          label={t('onboarding.country')}
          icon="Flag"
          value={me.country}
          placeholder={t('onboarding.countryFromSection')}
        />
      </Specimen>

      <Specimen label={`CoachMark · tail at 60px${coach ? '' : ' · dismissed, tap again to replay'}`}>
        <CoachMark
          key={String(coach)}
          title={t('onboarding.coachTitle')}
          body={t('onboarding.coachBody')}
          dismissLabel={t('onboarding.coachDismiss')}
          onDismiss={() => setCoach((on) => !on)}
        />
      </Specimen>

      <Specimen label="WallHeader · full (owner, real approved count)">
        <WallHeader user={OWNER} count={12} onSection={() => undefined} />
      </Specimen>

      <Specimen label="WallHeader · compact (pushed profile)">
        <WallHeader user={OWNER} count={12} compact onSection={() => undefined} />
      </Specimen>

      <Specimen label="WallHeader · preview, empty (sign-up, nothing typed yet)">
        <WallHeader preview user={{ name: '' }} />
      </Specimen>

      <Specimen label="WallHeader · preview, filled">
        <WallHeader preview user={{ ...OWNER, hasPhoto: true }} />
      </Specimen>

      <Specimen label="TabBar · [D2] Events · Inbox · Threads · Profile · real badges">
        <TabBar value={tab} onChange={setTab} badges={{ inbox: 3, threads: 2 }} />
      </Specimen>

      <Specimen label={`Swipe · a QueueCard, ±90px to decide${swiped ? ` · last: ${swiped}` : ''}`}>
        <Swipe onApprove={() => setSwiped('approve')} onReject={() => setSwiped('reject')}>
          <QueueCard
            index={1}
            text={posts.bus}
            sender={{ level: 'hint', hints: { section: 'ESN Ankara' } }}
            time="8s"
          />
        </Swipe>
      </Specimen>

      <Specimen label="PersonPicker · inline, searchable">
        <PersonPicker members={roster} value={picked} onPick={setPicked} />
      </Specimen>

      <Specimen label="ThreadRow · masked unread / named read">
        <Group>{(['anonymous','named'] as const).map((level,index)=><ThreadRow key={level} onPress={()=>undefined} thread={{id:level,other:level==='named'?{level,name:me.name}:{level},source:'Welcome night',unreadCount:index?0:2,updatedAt:'2026-09-10T18:30:00Z',lastMessage:{id:level,text:posts.bus,sender:{level:'anonymous'},mine:!!index,createdAt:'2026-09-10T18:30:00Z'}}}/>)}</Group>
      </Specimen>
      <Specimen label="ThreadComposer · screening warning / retained draft on failure">
        <View style={[frame,{height:340}]}><ThreadComposer onScreen={async()=>({warning:true})} onSend={async()=>{throw new Error('Gallery delivery failure');}}/></View>
      </Specimen>
      <Specimen label="Back · thread identity and source">
        <Back onBack={()=>undefined} middle={<AnonymityBadge level="hint" hints={{section:me.section,country:me.country,letter:me.name[0]}}/>} right={<IconButton icon="Ellipsis" label={t('common.more')} onPress={()=>undefined}/>}/>
      </Specimen>
      <Specimen label="ChoiceRow · selected / unselected / disabled">
        <Group><ChoiceRow label={t('settings.anyone')} description={t('settingsFlow.anyone')} selected onPress={()=>undefined}/><ChoiceRow label={t('settings.namedOnly')} selected={false} onPress={()=>undefined}/><ChoiceRow label={t('settings.nobody')} selected={false} disabled onPress={()=>undefined}/></Group>
      </Specimen>
      <Specimen label="BlockedRow · anonymous / hint / named">
        <Group><BlockedRow sender={{level:'anonymous'}} onUnblock={()=>undefined}/><BlockedRow sender={{level:'hint',hints:{section:me.section,country:me.country}}} onUnblock={()=>undefined}/><BlockedRow sender={{level:'named',name:me.name}} busy onUnblock={()=>undefined}/></Group>
      </Specimen>
      <PatternSheets />
      <Specimen label="EventHeader · upcoming / live / archived">
        <EventHeader name="Welcome night" status="upcoming" date="14 Nov · 20:00–23:00" scope="ESN Ankara" />
        <EventHeader name="Welcome night" status="live" date="14 Nov · 20:00–23:00" scope="ESN Ankara" />
        <EventHeader name="Welcome night" status="archived" date="14 Nov · 20:00–23:00" scope="ESN Ankara" />
      </Specimen>
      <Specimen label="LoadState · loading / failed">
        <LoadState onRetry={() => undefined} />
        <LoadState error onRetry={() => undefined} />
      </Specimen>
      <Specimen label="EventDatePicker · date then time / EventScanner · permission then camera">
        <Button onPress={() => setEventTool('date')}>{t('events.starts')}</Button>
        <Button onPress={() => setEventTool('scan')}>{t('events.scanQr')}</Button>
        {eventTool === 'date' && <EventDatePicker value={eventDate} onChange={setEventDate} onClose={() => setEventTool(null)} />}
        {eventTool === 'scan' && <><EventScanner onCode={() => setEventTool(null)} /><Button onPress={() => setEventTool(null)}>{t('common.close')}</Button></>}
      </Specimen>
    </GallerySection>
  );
}

const styles = StyleSheet.create({
  // 390 is the prototype's frame width; the gallery column is narrower, so it
  // is a cap, not a fixed width.
  frame: { width: '100%', maxWidth: 390, height: 300, borderWidth: 1, overflow: 'hidden' },
  grow: { flex: 1 },
});

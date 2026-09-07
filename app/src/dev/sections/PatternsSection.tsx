import React, { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { QueueCard } from '../../components/cards';
import { Button, IconButton, StatusPill, Switch } from '../../components/core';
import {
  Back,
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

      <PatternSheets />
    </GallerySection>
  );
}

const styles = StyleSheet.create({
  // 390 is the prototype's frame width; the gallery column is narrower, so it
  // is a cap, not a fixed width.
  frame: { width: '100%', maxWidth: 390, height: 300, borderWidth: 1, overflow: 'hidden' },
  grow: { flex: 1 },
});

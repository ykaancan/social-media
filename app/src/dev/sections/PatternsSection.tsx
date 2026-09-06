import React, { useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { QueueCard } from '../../components/cards';
import { IconButton, StatusPill, Switch } from '../../components/core';
import {
  Back,
  Empty,
  Group,
  Note,
  PersonPicker,
  PersonRow,
  Row,
  Swipe,
  TabBar,
  WallHeader,
  type PickerPerson,
  type TabId,
} from '../../components/patterns';
import { useTranslation } from '../../i18n';
import { me, posts, roster } from '../fixtures';
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

  const [tab, setTab] = useState<TabId>('events');
  const [picked, setPicked] = useState<PickerPerson | undefined>(undefined);
  const [notif, setNotif] = useState(true);
  const [swiped, setSwiped] = useState<string | null>(null);

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

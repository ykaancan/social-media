import React, { useState } from 'react';
import { View } from 'react-native';
import {
  Avatar,
  Button,
  Chip,
  Icon,
  ICON_NAMES,
  IconButton,
  Input,
  Sheet,
  StatusPill,
  Switch,
  Tabs,
  Text,
  Toast,
} from '../../components/core';
import { useTranslation } from '../../i18n';
import { typography, useTheme, type TypographyVariant } from '../../theme';
import { Cluster, GallerySection, Specimen } from '../kit';

const WRITE_TO_ME = ['anyone', 'named', 'nobody'] as const;

/** Every app-scheme variant. The projector faces are 72–120px and live in their own section. */
const TYPE_SCALE = (Object.keys(typography) as TypographyVariant[]).filter(
  (v) => !v.startsWith('projector')
);

export function CoreSection({ onLayout }: { onLayout?: (e: import('react-native').LayoutChangeEvent) => void }) {
  const { colors, space, text } = useTheme();
  const { t } = useTranslation();

  const [bio, setBio] = useState("Where you're from, what you're into");
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  const [who, setWho] = useState<(typeof WRITE_TO_ME)[number]>('anyone');
  const [tab, setTab] = useState('board');
  const [mode, setMode] = useState('approve_first');
  const [on, setOn] = useState(true);
  const [bare, setBare] = useState(false);
  const [sheet, setSheet] = useState(false);

  return (
    <GallerySection
      id="core"
      title="Core"
      subtitle="core.card.html — buttons, icon buttons, inputs, chips, switch, tabs, toasts, avatars, status pills"
      onLayout={onLayout}
    >
      <Specimen label="Button · primary / secondary / ghost / danger / event · loading · disabled">
        <Cluster>
          <Button size="lg" icon="PenLine">
            {t('wall.writeOnWall')}
          </Button>
          <Button>{t('inbox.approveToWall')}</Button>
          <Button variant="secondary">{t('inbox.keepPrivate')}</Button>
          <Button variant="ghost" size="sm">
            {t('common.cancel')}
          </Button>
          <Button variant="danger" size="sm" icon="Trash2">
            {t('common.delete')}
          </Button>
          <Button variant="event" icon="Radio">
            {t('events.board')}
          </Button>
          <Button loading>{t('composer.send')}</Button>
          <Button disabled>{t('composer.send')}</Button>
        </Cluster>
      </Specimen>

      <Specimen label="Button · sizes sm / md / lg · iconRight · full">
        <Cluster>
          <Button size="sm" variant="secondary" icon="Check">
            {t('common.done')}
          </Button>
          <Button size="md" variant="secondary" icon="Check">
            {t('common.done')}
          </Button>
          <Button size="lg" variant="secondary" icon="Check">
            {t('common.done')}
          </Button>
          <Button variant="ghost" iconRight="ChevronRight">
            {t('common.next')}
          </Button>
        </Cluster>
        <Button full size="lg" icon="LogIn">
          {t('events.join')}
        </Button>
      </Specimen>

      <Specimen label="IconButton · ghost / outline+badge / filled / event / lg">
        <Cluster>
          <IconButton icon="ArrowLeft" label={t('common.back')} />
          <IconButton icon="ListChecks" label={t('events.queue')} variant="outline" badge={7} />
          <IconButton icon="Share" label={t('common.share')} variant="filled" />
          <IconButton icon="Projector" label={t('events.projector')} variant="event" />
          <IconButton icon="PenLine" label={t('wall.writeOnWall')} variant="filled" size="lg" />
          <IconButton icon="Ellipsis" label={t('common.more')} size="sm" />
          <IconButton icon="Bell" label={t('settings.notifications')} variant="outline" badge={128} />
          <IconButton icon="Send" label={t('composer.send')} variant="filled" disabled />
        </Cluster>
      </Specimen>

      <Specimen label="Avatar · xl / lg / md / sm / xs · initial tints by name hash">
        <Cluster gap={space.s3}>
          <Avatar name="Şeyma Kaya" size="xl" />
          <Avatar name="Şeyma Kaya" size="lg" />
          <Avatar name="Deniz" size="md" />
          <Avatar name="Ahmet" size="sm" />
          <Avatar name="İrem" size="xs" />
        </Cluster>
        <Cluster gap={space.s3}>
          {['İrem', 'ırmak', 'Ada', 'Berk', 'Ceren', 'Deniz', 'Ece', 'Giulia'].map((n) => (
            <Avatar key={n} name={n} />
          ))}
        </Cluster>
      </Specimen>

      <Specimen label="StatusPill · live / upcoming / archived / pending / rejected / onwall · md + lg">
        <Cluster>
          <StatusPill status="live" />
          <StatusPill status="upcoming" />
          <StatusPill status="archived" />
          <StatusPill status="pending" />
          <StatusPill status="rejected" />
          <StatusPill status="onwall" />
        </Cluster>
        <Cluster>
          <StatusPill status="live" size="lg" />
          <StatusPill status="archived" size="lg" />
        </Cluster>
      </Specimen>

      <Specimen label="Input · label + counter · display join code · hint · multiline · error">
        <Input label={t('onboarding.bio')} value={bio} onChange={setBio} maxLength={80} />
        <Input
          label={t('events.joinCode')}
          value={code}
          onChange={setCode}
          placeholder={t('events.enterCode')}
          hint={t('events.codeHint')}
          maxLength={6}
          inputStyle={{ fontFamily: text.displayMd.fontFamily, fontSize: 24, letterSpacing: 2.4 }}
        />
        <Input
          label={t('settings.mutedWords')}
          value={note}
          onChange={setNote}
          multiline
          rows={3}
          placeholder={t('composer.placeholderBoard')}
          maxLength={280}
        />
        <Input label={t('events.name')} value="" error={t('events.endAfterStart')} />
      </Specimen>

      <Specimen label="Chip · selected toggle · neutral / outline / event / live · sm">
        <Cluster>
          {WRITE_TO_ME.map((k) => (
            <Chip key={k} selected={who === k} onPress={() => setWho(k)}>
              {t(
                k === 'anyone'
                  ? 'settings.anyone'
                  : k === 'named'
                    ? 'settings.namedOnly'
                    : 'settings.nobody'
              )}
            </Chip>
          ))}
        </Cluster>
        <Cluster>
          <Chip icon="MapPin">ESN İzmir</Chip>
          <Chip tone="outline" icon="Flag" size="sm">
            Türkiye
          </Chip>
          <Chip tone="event" icon="Radio" size="sm">
            National Platform
          </Chip>
          <Chip tone="live" icon="Radio" size="sm">
            {t('events.live')}
          </Chip>
        </Cluster>
      </Specimen>

      <Specimen label="Tabs · underline (count, hot) · segmented">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { id: 'board', label: t('events.board') },
            { id: 'queue', label: t('events.queue'), count: 7, hot: true },
            { id: 'people', label: t('events.people'), count: 212 },
            { id: 'room', label: t('section.room'), disabled: true },
          ]}
        />
        <Tabs
          variant="segmented"
          value={mode}
          onChange={setMode}
          items={[
            { id: 'approve_first', label: t('events.approveFirst') },
            { id: 'post_immediately', label: t('events.postImmediately') },
          ]}
        />
      </Specimen>

      <Specimen label="Switch · label + description · bare track">
        <Switch
          checked={on}
          onChange={setOn}
          label={t('settings.notifInbox')}
          description={t('settings.notifInboxDesc')}
        />
        <Cluster>
          <Switch checked={bare} onChange={setBare} />
          <Switch checked={!bare} onChange={(v) => setBare(!v)} />
        </Cluster>
      </Specimen>

      <Specimen label="Toast · neutral / warn / danger / live · with and without an action">
        <Toast message={t('inbox.onWall')} action="View" />
        <Toast tone="warn" message={t('composer.screeningWarning')} />
        <Toast tone="danger" message={t('events.codeNotFound')} />
        <Toast tone="live" icon="ArrowUp" message={t('board.newPosts', { n: 3 })} action={t('board.show')} />
        <Toast icon={null} message={t('common.copied')} />
      </Specimen>

      <Specimen label={`Text · ${TYPE_SCALE.length} app-scheme variants`}>
        {TYPE_SCALE.map((v) => (
          <Text key={v} variant={v} numberOfLines={1}>
            {v}
          </Text>
        ))}
      </Specimen>

      <Specimen label={`Icon · all ${ICON_NAMES.length} in the set`}>
        <Cluster gap={space.s3}>
          {ICON_NAMES.map((n) => (
            <View key={n} style={{ width: 28, alignItems: 'center' }}>
              <Icon name={n} size={22} color={colors.text} />
            </View>
          ))}
        </Cluster>
      </Specimen>

      <Specimen label="Sheet · title + close button + scrim">
        <Button variant="secondary" onPress={() => setSheet(true)}>
          Open Sheet
        </Button>
        {sheet ? (
          <Sheet title={t('report.title')} onClose={() => setSheet(false)}>
            <Text variant="body" color={colors.text2}>
              {t('report.sent')}
            </Text>
            <Button full size="lg" onPress={() => setSheet(false)}>
              {t('common.done')}
            </Button>
          </Sheet>
        ) : null}
      </Specimen>
    </GallerySection>
  );
}

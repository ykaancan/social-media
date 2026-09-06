import React, { useState } from 'react';
import { View } from 'react-native';
import { AnonymityBadge } from '../../components/anonymity';
import { Button, Text } from '../../components/core';
import {
  Composer,
  ConfirmSheet,
  ControlsSheet,
  CreateSheet,
  inboxMoreItems,
  JoinSheet,
  ModsSheet,
  MoreSheet,
  ReplySheet,
  ReportSheet,
  SectionSheet,
  threadMoreItems,
  type BoardMode,
  type JoinResult,
  type PickerPerson,
  type PostPreview,
  type SectionOption,
} from '../../components/patterns';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../theme';
import { events, me, people, posts, roster, sections } from '../fixtures';
import { Specimen } from '../kit';

type SheetId =
  | 'confirm-danger'
  | 'confirm-reveal'
  | 'report-post'
  | 'report-thread'
  | 'more-new'
  | 'more-approved'
  | 'more-thread'
  | 'more-thread-revealed'
  | 'reply'
  | 'composer-member'
  | 'composer-mod'
  | 'composer-immediate'
  | 'composer-wall'
  | 'section'
  | 'join'
  | 'create'
  | 'mods'
  | 'controls';

const anonPost: PostPreview = {
  text: posts.karaoke,
  sender: { level: 'anonymous' },
  time: '1h',
  source: events.np.name,
};

const namedPost: PostPreview = {
  text: posts.speaker,
  sender: { level: 'named', name: people.deniz.name },
  time: '2m',
  source: events.np.name,
};

/** The fixture start/end. The pickers add an hour, so multi-day is one tap away. */
const START = new Date(2026, 10, 30, 20, 0);
const END = new Date(2026, 10, 30, 23, 0);
const HOUR = 60 * 60 * 1000;

export function PatternSheets() {
  const { colors, space } = useTheme();
  const { t } = useTranslation();

  const [open, setOpen] = useState<SheetId | null>(null);
  const close = () => setOpen(null);

  const [section, setSection] = useState<SectionOption>(sections[0]!);
  const [start, setStart] = useState(START);
  const [end, setEnd] = useState(END);
  const [mode, setMode] = useState<BoardMode>('approve_first');
  const [boardEnd, setBoardEnd] = useState<string | null>('02:00');
  const [mods, setMods] = useState<PickerPerson[]>([people.ece]);

  const pool = roster.filter((p) => p.id !== people.kaan.id && !mods.some((m) => m.id === p.id));

  /** The fake server behind JoinSheet — codes from HANDOFF §4. */
  const resolveCode = (code: string): JoinResult => {
    if (code === events.izm.code) {
      return {
        ok: true,
        event: {
          name: events.izm.name,
          status: 'upcoming',
          cover: events.izm.cover,
          day: events.izm.day,
          month: events.izm.month,
          timeRange: events.izm.timeRange,
          scope: events.izm.scope,
          memberCount: events.izm.memberCount,
        },
      };
    }
    if (code === events.np.code) {
      return { ok: false, reason: 'already_joined', eventName: events.np.name };
    }
    return { ok: false, reason: 'not_found' };
  };

  const opener = (id: SheetId, label: string) => (
    <Button variant="secondary" onPress={() => setOpen(id)}>
      {label}
    </Button>
  );

  return (
    <>
      <Specimen label="ConfirmSheet · danger">
        {opener('confirm-danger', 'Open · delete account')}
        {open === 'confirm-danger' ? (
          <ConfirmSheet
            title={t('settings.deleteAccount')}
            body={t('settings.deleteConfirm')}
            action={t('common.delete')}
            onClose={close}
            onConfirm={close}
          />
        ) : null}
      </Specimen>

      <Specimen label="ConfirmSheet · primary + reveal preview">
        {opener('confirm-reveal', 'Open · reveal myself')}
        {open === 'confirm-reveal' ? (
          <ConfirmSheet
            danger={false}
            title={t('anon.revealMyself')}
            body={t('thread.revealConfirm')}
            action={t('anon.showThem')}
            preview={
              <View style={{ gap: space.s2 }}>
                <Text variant="caption" color={colors.text2}>
                  {t('anon.preview')}
                </Text>
                <AnonymityBadge level="named" name={me.name} size="lg" />
              </View>
            }
            onClose={close}
            onConfirm={close}
          />
        ) : null}
      </Specimen>

      <Specimen label="ReportSheet · post">
        {opener('report-post', 'Open · report a post')}
        {open === 'report-post' ? (
          <ReportSheet post={anonPost} onClose={close} onReport={close} />
        ) : null}
      </Specimen>

      <Specimen label="ReportSheet · thread (no preview, threadNote)">
        {opener('report-thread', 'Open · report a thread')}
        {open === 'report-thread' ? <ReportSheet threadNote onClose={close} onReport={close} /> : null}
      </Specimen>

      <Specimen label="MoreSheet · inboxMoreItems · new message, anonymous sender">
        {opener('more-new', 'Open · new message')}
        {open === 'more-new' ? (
          <MoreSheet
            post={anonPost}
            items={inboxMoreItems({ state: 'new', sender: anonPost.sender }, t)}
            onPick={close}
            onClose={close}
          />
        ) : null}
      </Specimen>

      <Specimen label="MoreSheet · inboxMoreItems · approved message, named sender (Take off the wall)">
        {opener('more-approved', 'Open · message on the wall')}
        {open === 'more-approved' ? (
          <MoreSheet
            post={namedPost}
            items={inboxMoreItems({ state: 'approved', sender: namedPost.sender }, t)}
            onPick={close}
            onClose={close}
          />
        ) : null}
      </Specimen>

      {/* thread-app.jsx line 161: the thread overflow is about the whole thread,
          so it opens with NO card — the [D1] MoreSheet's `post` is optional. */}
      <Specimen label="MoreSheet · threadMoreItems · no card, reveal + description, anonymous other">
        {opener('more-thread', 'Open · thread overflow')}
        {open === 'more-thread' ? (
          <MoreSheet
            items={threadMoreItems({ canReveal: true, otherIsNamed: false }, t)}
            onPick={close}
            onClose={close}
          />
        ) : null}
      </Specimen>

      <Specimen label="MoreSheet · threadMoreItems · already revealed [D5], named other (Block Deniz)">
        {opener('more-thread-revealed', 'Open · thread overflow, revealed')}
        {open === 'more-thread-revealed' ? (
          <MoreSheet
            items={threadMoreItems(
              { canReveal: false, otherIsNamed: true, otherFirstName: people.deniz.name },
              t
            )}
            onPick={close}
            onClose={close}
          />
        ) : null}
      </Specimen>

      <Specimen label="ReplySheet · starts a private thread from a post">
        {opener('reply', 'Open · reply privately')}
        {open === 'reply' ? (
          <ReplySheet
            me={{ name: me.name, section: me.section, country: me.country }}
            post={anonPost}
            initialLevel="hint"
            initialHintFields={{ section: true }}
            onClose={close}
            onSend={close}
          />
        ) : null}
      </Specimen>

      <Specimen label="Composer · board · approve_first · member (queue hint)">
        {opener('composer-member', 'Open · board composer')}
        {open === 'composer-member' ? (
          <Composer
            me={{ name: me.name, section: me.section, country: me.country }}
            members={roster}
            boardMode="approve_first"
            onClose={close}
            onSend={close}
          />
        ) : null}
      </Specimen>

      <Specimen label="Composer · board · approve_first · moderator [D9] (no queue hint)">
        {opener('composer-mod', 'Open · moderator composer')}
        {open === 'composer-mod' ? (
          <Composer
            me={{ name: people.kaan.name, section: people.kaan.section, country: people.kaan.country }}
            members={roster}
            boardMode="approve_first"
            isModerator
            initialLevel="named"
            onClose={close}
            onSend={close}
          />
        ) : null}
      </Specimen>

      <Specimen label="Composer · board · post_immediately">
        {opener('composer-immediate', 'Open · post_immediately')}
        {open === 'composer-immediate' ? (
          <Composer
            me={{ name: me.name, section: me.section, country: me.country }}
            members={roster}
            boardMode="post_immediately"
            initialLevel="hint"
            initialHintFields={{ section: true, letter: true }}
            onClose={close}
            onSend={close}
          />
        ) : null}
      </Specimen>

      <Specimen label="Composer · wall owner (fixed target, no tabs, no picker)">
        {opener('composer-wall', 'Open · write on a wall')}
        {open === 'composer-wall' ? (
          <Composer
            me={{ name: me.name, section: me.section, country: me.country }}
            wallOwner={people.seyma}
            onClose={close}
            onSend={close}
          />
        ) : null}
      </Specimen>

      <Specimen label={`SectionSheet · ${sections.length} sections · current "${section.name}"`}>
        {opener('section', 'Open · pick a section')}
        {open === 'section' ? (
          <SectionSheet
            sections={sections}
            value={section.id}
            onPick={(s) => {
              setSection(s);
              close();
            }}
            onClose={close}
          />
        ) : null}
      </Specimen>

      <Specimen label={`JoinSheet · ${events.izm.code} joins · ${events.np.code} already in · anything else not found`}>
        {opener('join', 'Open · join by code or QR')}
        {open === 'join' ? (
          <JoinSheet
            onSubmitCode={resolveCode}
            onScan={() => undefined}
            onClose={close}
            onOpenEvent={close}
          />
        ) : null}
      </Specimen>

      <Specimen label="CreateSheet · Starts / Ends add an hour (30 Nov 23:00 → 1 Dec = multi-day, cross-month)">
        {opener('create', 'Open · create an event')}
        {open === 'create' ? (
          <CreateSheet
            me={{ section: me.section }}
            start={start}
            end={end}
            onPickStart={() => setStart((d) => new Date(d.getTime() + HOUR))}
            onPickEnd={() => setEnd((d) => new Date(d.getTime() + HOUR))}
            onClose={close}
            onCreate={close}
          />
        ) : null}
      </Specimen>

      <Specimen label={`ModsSheet · creator ${people.kaan.name} · ${mods.length} co-moderator · ${pool.length} in the pool`}>
        {opener('mods', 'Open · co-moderators')}
        {open === 'mods' ? (
          <ModsSheet
            me={people.kaan}
            creator={people.kaan}
            mods={mods}
            pool={pool}
            eventName={events.np.name}
            onAdd={(p) => setMods((m) => [...m, p])}
            onRemove={(p) => setMods((m) => m.filter((x) => x.id !== p.id))}
            onClose={close}
          />
        ) : null}
      </Specimen>

      <Specimen label={`ControlsSheet · mode ${mode} · ends ${boardEnd ?? 'never'} · 7 waiting`}>
        {opener('controls', 'Open · board controls')}
        {open === 'controls' ? (
          <ControlsSheet
            mode={mode}
            onMode={setMode}
            end={boardEnd}
            endOptions={['01:00', '02:00', '03:00']}
            onEnd={setBoardEnd}
            pendingCount={7}
            onCloseBoard={close}
            onClose={close}
          />
        ) : null}
      </Specimen>
    </>
  );
}

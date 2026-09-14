import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../theme';
import { AnonymitySelector, type HintFields } from '../anonymity';
import type { AnonymityLevel } from '../anonymity/AnonymityBadge';
import { PostCard } from '../cards';
import { Avatar } from '../core/Avatar';
import { Button } from '../core/Button';
import { Icon } from '../core/Icon';
import { Input } from '../core/Input';
import { Sheet } from '../core/Sheet';
import { Tabs } from '../core/Tabs';
import { Text } from '../core/Text';
import type { BoardMode } from './CreateSheet';
import { PersonPicker, type PickerPerson } from './PersonPicker';
import { firstName, senderFor, type MeView, type SenderView } from './ReplySheet';
import { Note } from './Note';

/** post / wall message — HANDOFF §4. */
export const COMPOSER_MAX = 280;

export type ComposerTarget = 'room' | 'person';

export interface ComposerPayload {
  screeningAcknowledged?: boolean;
  text: string;
  sender: SenderView;
  target: ComposerTarget;
  person?: PickerPerson;
}

export interface ComposerProps {
  initialText?: string;
  me: MeView;
  /** Joined members, for the "to a person" picker. Ignored when `wallOwner` is set. */
  members?: PickerPerson[];
  /** Wall composer: a fixed target, so no room/person tabs and no picker. */
  wallOwner?: PickerPerson;
  boardMode?: BoardMode;
  /** [D9] a creator's or co-moderator's post to the room publishes immediately. */
  isModerator?: boolean;
  initialLevel?: AnonymityLevel;
  initialHintFields?: HintFields;
  /** Fires on every level/hint change, so the app can remember the last choice. */
  onLevelChange?: (level: AnonymityLevel, hintFields: HintFields) => void;
  onClose: () => void;
  onScreen?: (text: string) => Promise<{ warning: boolean }>;
  onSend: (payload: ComposerPayload) => void | Promise<void>;
  namedOnly?: boolean;
}

/**
 * The one composer: to the room, to a person, or to a fixed wall.
 *
 * A post addressed to a person never enters a board queue in either board mode
 * — only the recipient decides on it (brief §4.5) — which is why the
 * approve-first hint is bound to `target === 'room'`. [D9] suppresses that hint
 * for a moderator, whose room post publishes immediately in both modes.
 *
 * Screening uses the existing warning Note. Acknowledgement is tied to the
 * exact draft; changing text, target or anonymity requires a fresh check.
 */
export function Composer({
  me,
  initialText = '',
  members = [],
  wallOwner,
  boardMode,
  isModerator = false,
  initialLevel = 'anonymous',
  initialHintFields = { section: true },
  onLevelChange,
  onClose,
  onSend,
  onScreen,
  namedOnly = false,
}: ComposerProps) {
  const { colors, radius } = useTheme();
  const { t } = useTranslation();

  const [text, setText] = useState(initialText);
  const [target, setTarget] = useState<ComposerTarget>(wallOwner ? 'person' : 'room');
  const [person, setPerson] = useState<PickerPerson | undefined>(wallOwner);
  const [level, setLevel] = useState<AnonymityLevel>(initialLevel);
  const [hintFields, setHintFields] = useState<HintFields>(initialHintFields);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState(false);
  const [warnedDraft, setWarnedDraft] = useState<string>();

  const changeLevel = (next: AnonymityLevel) => {
    if (submitting.current) return;
    setLevel(next);
    onLevelChange?.(next, hintFields);
  };
  const changeHintFields = (next: HintFields) => {
    if (submitting.current) return;
    setHintFields(next);
    onLevelChange?.(level, next);
  };

  const sender = senderFor(me, level, hintFields);
  const body = text.trim();
  const canSend = body.length > 0 && body.length <= COMPOSER_MAX && (target === 'room' || Boolean(person)) &&
    (level !== 'hint' || Object.values(hintFields).some(Boolean)) && (!namedOnly || level === 'named');
  const draftKey = JSON.stringify([body, sender, target, person?.id]);
  const latestDraft = useRef(draftKey);
  latestDraft.current = draftKey;
  const warning = warnedDraft === draftKey;
  const submit = async () => {
    if (submitting.current || !canSend) return;
    submitting.current = true; setBusy(true); setError(false);
    try {
      if (onScreen && !warning) {
        const result = await onScreen(body);
        if (latestDraft.current !== draftKey) return;
        if (result.warning) { setWarnedDraft(draftKey); return; }
      }
      await onSend({ text: body, sender, target, person, ...(warning ? { screeningAcknowledged: true } : {}) });
    } catch { setError(true); }
    finally { submitting.current = false; setBusy(false); }
  };

  const title = wallOwner
    ? t('composer.toWall', { name: firstName(wallOwner.name) })
    : target === 'room'
      ? t('board.toTheRoom')
      : person
        ? t('composer.toPerson', { name: firstName(person.name) })
        : t('board.toAPerson');

  const placeholder =
    target === 'room'
      ? t('composer.placeholderBoard')
      : person
        ? t('composer.placeholderWall', { name: firstName(person.name) })
        : t('composer.pickPersonFirst');

  const showApproveFirstHint = target === 'room' && boardMode === 'approve_first' && !isModerator;

  return (
    <Sheet title={title} onClose={busy ? undefined : onClose} style={styles.sheet} testID="composer">
      {wallOwner ? null : (
        <Tabs
          variant="segmented"
          value={target}
          onChange={(id) => {
            if (submitting.current) return;
            const next = id as ComposerTarget;
            setTarget(next);
            if (next === 'person' && !person) setPicking(true);
          }}
          items={[
            { id: 'room', label: t('board.toTheRoom') },
            { id: 'person', label: t('board.toAPerson') },
          ]}
          testID="composer-target"
        />
      )}

      {!wallOwner && target === 'person' ? (
        picking || !person ? (
          <PersonPicker
            members={members}
            value={person}
            onPick={(m) => {
              if (submitting.current) return;
              setPerson(m);
              setPicking(false);
            }}
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={person.name}
            testID="composer-person"
            onPress={() => { if (!submitting.current) setPicking(true); }}
            style={[styles.personRow, { borderColor: colors.borderStrong, borderRadius: radius.md }]}
          >
            <Avatar name={person.name} src={person.avatar} size="sm" />
            <View style={styles.personText}>
              <Text variant="bodySmStrong" numberOfLines={1}>
                {person.name}
              </Text>
              <Text variant="caption" color={colors.text2}>
                {t('composer.goesToInbox')}
              </Text>
            </View>
            <Icon name="ChevronDown" size={18} />
          </Pressable>
        )
      ) : null}

      <Input
        multiline
        rows={3}
        autoFocus
        value={text}
        onChange={value => { if (!submitting.current) setText(value); }}
        maxLength={COMPOSER_MAX}
        placeholder={placeholder}
        testID="composer-text"
      />

      <View style={styles.block}>
        <Text variant="captionCaps" upper color={colors.text2}>
          {t('composer.postAs')}
        </Text>
        <AnonymitySelector
          value={level}
          onChange={changeLevel}
          hintFields={hintFields}
          onHintFieldsChange={changeHintFields}
          me={me}
        />
      </View>

      <View style={styles.block}>
        <Text variant="captionCaps" upper color={colors.text2}>
          {t('composer.yourCard')}
        </Text>
        <PostCard
          text={body || '…'}
          sender={sender}
          time={t('common.justNow')}
          style={body ? undefined : styles.previewIdle}
        />
      </View>

      {showApproveFirstHint ? (
        <View style={styles.hint} testID="composer-approve-first">
          <Icon name="Clock" size={16} color={colors.text2} />
          <Text variant="bodySm" color={colors.text2} style={styles.hintText}>
            {t('composer.approveFirstHint')}
          </Text>
        </View>
      ) : null}

      {target === 'person' && person ? (
        <View style={styles.hint}>
          <Icon name="Inbox" size={16} color={colors.text2} />
          <Text variant="bodySm" color={colors.text2} style={styles.hintText}>
            {t('composer.goesToInboxWall', { name: firstName(person.name) })}
          </Text>
        </View>
      ) : null}

      {namedOnly && <Note>{t('messageFlow.namedOnly')}</Note>}
      {warning && <Note icon="TriangleAlert" testID="composer-screening-warning">
        <Text variant="bodyStrong">{t('composer.screeningWarning')}</Text>
        <Text>{t('composer.screeningDetail')}</Text>
      </Note>}
      {error && <Text accessibilityRole="alert" color={colors.danger}>{t('messageFlow.sendError')}</Text>}
      <Button
        size="lg"
        full
        icon="Send"
        disabled={!canSend || busy}
        loading={busy}
        onPress={() => { void submit(); }}
        testID="composer-send"
      >
        {t(warning ? 'messageFlow.sendAnyway' : 'composer.send')}
      </Button>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheet: { maxHeight: '94%' },
  block: { flexDirection: 'column', gap: 8 },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1.5,
  },
  personText: { flex: 1, minWidth: 0 },
  previewIdle: { opacity: 0.6 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hintText: { flex: 1, minWidth: 0 },
});

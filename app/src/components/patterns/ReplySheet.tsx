import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../theme';
import { AnonymitySelector, type AnonymityLevel, type HintFields } from '../anonymity';
import { PostCard } from '../cards';
import { Button } from '../core/Button';
import { Icon } from '../core/Icon';
import { Input } from '../core/Input';
import { Sheet } from '../core/Sheet';
import { Text } from '../core/Text';

/** post / wall message / reply-that-starts-a-thread — HANDOFF §4. */
export const REPLY_MAX = 280;

/**
 * How a sender is shown on a card. This is the *display* shape only: the server
 * always knows who wrote the row (CLAUDE.md §2.1), and the level travels with
 * the row it was sent at and is never rewritten ([D5]).
 */
export interface SenderView {
  level: AnonymityLevel;
  name?: string;
  avatar?: string;
  hints?: { section?: string; country?: string; letter?: string };
}

/** The subset of a post/message these sheets need in order to preview it. */
export interface PostPreview {
  text: string;
  sender?: SenderView;
  time?: string;
  source?: string;
}

/** The signed-in user, as the anonymity selector and `senderFor` need them. */
export interface MeView {
  name: string;
  avatar?: string;
  section?: string;
  /** [D11] read through the section, never a free-typed nationality. */
  country?: string;
}

/** "Deniz Aksoy" -> "Deniz". The prototypes' `first()`. */
export function firstName(name = ''): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

/**
 * Port of full-app.jsx line 173. Builds the card-sender for a level + the hint
 * fields the sender ticked. The web version writes `null` for an unticked hint;
 * RN props are optional rather than nullable, so unticked fields are simply
 * absent — same rendering, one less falsy shape to check.
 */
export function senderFor(me: MeView, level: AnonymityLevel, hintFields: HintFields = {}): SenderView {
  return {
    level,
    name: level === 'named' ? me.name : undefined,
    avatar: level === 'named' ? me.avatar : undefined,
    hints:
      level === 'hint'
        ? {
            section: hintFields.section ? me.section : undefined,
            country: hintFields.country ? me.country : undefined,
            letter: hintFields.letter ? me.name.charAt(0) : undefined,
          }
        : undefined,
  };
}

export interface ReplyPayload {
  text: string;
  level: AnonymityLevel;
  hints: SenderView['hints'];
}

export interface ReplySheetProps {
  me: MeView;
  post: PostPreview;
  initialLevel?: AnonymityLevel;
  initialHintFields?: HintFields;
  onClose: () => void;
  onSend: (payload: ReplyPayload) => void;
}

/**
 * "Reply privately" — opens a thread from a board post or an inbox message
 * (brief §4.7; no cold DMs in stage 1).
 *
 * The level picked here is the level the *first* message is sent at. It is
 * stored on that message and never rewritten; the level later messages go out
 * at lives on `thread_participant` ([D5]), which is the screen's business, not
 * this sheet's.
 */
export function ReplySheet({
  me,
  post,
  initialLevel = 'anonymous',
  initialHintFields = { section: true },
  onClose,
  onSend,
}: ReplySheetProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const [text, setText] = useState('');
  const [level, setLevel] = useState<AnonymityLevel>(initialLevel);
  const [hintFields, setHintFields] = useState<HintFields>(initialHintFields);

  const canSend = text.trim().length > 0;

  return (
    <Sheet title={t('inbox.replyPrivately')} onClose={onClose} style={styles.sheet} testID="reply-sheet">
      <View style={styles.previewBlock}>
        <Text variant="captionCaps" upper color={colors.text2}>
          {t('composer.replyingTo')}
        </Text>
        <PostCard text={post.text} sender={post.sender} time={post.time} source={post.source} />
      </View>

      <Input
        multiline
        rows={3}
        autoFocus
        value={text}
        onChange={setText}
        maxLength={REPLY_MAX}
        placeholder={t('thread.placeholder')}
        testID="reply-text"
      />

      <View style={styles.block}>
        <Text variant="captionCaps" upper color={colors.text2}>
          {t('composer.replyAs')}
        </Text>
        <AnonymitySelector
          value={level}
          onChange={setLevel}
          hintFields={hintFields}
          onHintFieldsChange={setHintFields}
          me={me}
        />
      </View>

      <View style={styles.hint}>
        <Icon name="Lock" size={16} color={colors.text2} />
        <Text variant="bodySm" color={colors.text2} style={styles.hintText}>
          {t('composer.threadNote')}
        </Text>
      </View>

      <Button
        size="lg"
        full
        icon="Send"
        disabled={!canSend}
        onPress={() => onSend({ text: text.trim(), level, hints: senderFor(me, level, hintFields).hints })}
      >
        {t('composer.send')}
      </Button>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheet: { maxHeight: '94%' },
  previewBlock: { flexDirection: 'column', gap: 6 },
  block: { flexDirection: 'column', gap: 8 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hintText: { flex: 1, minWidth: 0 },
});

import React from 'react';
import type { TFunction } from 'i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useMotion, useTheme } from '../../theme';
import { PostCard } from '../cards';
import { Icon, type IconName } from '../core/Icon';
import { Sheet } from '../core/Sheet';
import { Text } from '../core/Text';
import { firstName, type PostPreview, type SenderView } from './ReplySheet';

/**
 * `t` as these helpers need it: a key plus `{n}`/`{name}` variables.
 *
 * Deliberately structural and widened to `string` keys so that a real
 * `useTranslation().t` (i18next's `TFunction`) is assignable to it directly —
 * callers must never need a cast. `TRANSLATE_ACCEPTS_TFUNCTION` below fails the
 * type-check if that ever stops being true.
 */
export type Translate = (key: string, vars?: Record<string, unknown>) => string;

/** Compile-time guard; erased at runtime. */
export const TRANSLATE_ACCEPTS_TFUNCTION: (t: TFunction) => Translate = (t) => t;

export interface MoreItem {
  id: string;
  icon: IconName;
  label: string;
  /** A `caption` line under the label — the thread sheet's reveal warning. */
  description?: string;
  danger?: boolean;
}

export interface MoreSheetProps {
  /**
   * The post or message the sheet is about, previewed above the actions.
   * Optional: the thread overflow ("…" in the thread header) is about the whole
   * thread, not one message, so it opens with the actions and no preview.
   */
  post?: PostPreview;
  items: MoreItem[];
  onPick: (id: string) => void;
  onClose: () => void;
}

/** [D12] inbox message states. The wall is exactly `approved`. */
export type InboxState = 'new' | 'private' | 'approved';

/**
 * The [D12] action list for one inbox message.
 *
 * - "Take off the wall" only exists on an `approved` message, because a message
 *   moves freely in both directions and the wall is exactly `approved`.
 * - Delete is a **soft delete** (`deleted_at`): a reported message has to
 *   survive the recipient deleting it, so no copy here says "removed".
 * - Block is issued **by message id** ([D6]), which is how the label can say
 *   "Block sender" without the blocker ever learning who the sender was. It
 *   refuses the blocked user's future writes; it deletes nothing.
 */
export function inboxMoreItems(
  msg: { state: InboxState; sender?: SenderView },
  t: Translate
): MoreItem[] {
  const named = msg.sender?.level === 'named' && Boolean(msg.sender?.name);
  const items: MoreItem[] = [
    { id: 'reply', icon: 'Reply', label: t('inbox.replyPrivately') },
  ];
  if (msg.state === 'approved') {
    items.push({ id: 'private', icon: 'EyeOff', label: t('inbox.takeOffWall') });
  }
  items.push(
    { id: 'report', icon: 'Flag', label: t('report.title') },
    {
      id: 'block',
      icon: 'Ban',
      label: named
        ? t('common.blockName', { name: firstName(msg.sender?.name) })
        : t('inbox.blockSender'),
    },
    { id: 'delete', icon: 'Trash2', label: t('common.delete'), danger: true }
  );
  return items;
}

/** The other side of a thread, as `threadMoreItems` needs to see them. */
export interface ThreadMoreContext {
  /** False once the sender has revealed themselves — reveal is one-way [D5]. */
  canReveal: boolean;
  otherIsNamed: boolean;
  /** Already a first name; a full name is trimmed to one all the same. */
  otherFirstName?: string;
}

/**
 * The thread overflow sheet's actions (`thread-app.jsx` line 161).
 *
 * Reveal only appears while there is something to reveal, and carries the
 * warning as its description: revealing updates `thread_participant` and posts a
 * system message, and [D5] it never unmasks the messages already sent — which is
 * why the copy says it cannot be undone *here*.
 *
 * Block names the person only when they are `named`; against an anonymous
 * sender it stays "Block", because [D6] blocking must never leak who they were.
 */
export function threadMoreItems(
  { canReveal, otherIsNamed, otherFirstName }: ThreadMoreContext,
  t: Translate
): MoreItem[] {
  const items: MoreItem[] = [];
  if (canReveal) {
    items.push({
      id: 'reveal',
      icon: 'Eye',
      label: t('anon.revealMyself'),
      description: t('thread.revealDesc'),
    });
  }
  items.push(
    { id: 'report', icon: 'Flag', label: t('report.title') },
    {
      id: 'block',
      icon: 'Ban',
      label: otherIsNamed
        ? t('common.blockName', { name: firstName(otherFirstName) })
        : t('common.block'),
      danger: true,
    }
  );
  return items;
}

function ActionRow({ item, onPress }: { item: MoreItem; onPress: () => void }) {
  const { colors, radius } = useTheme();
  const { dur, easing, pressScale } = useMotion();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const fg = item.danger ? colors.danger : colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.label}
      testID={`more-${item.id}`}
      onPress={onPress}
      onPressIn={() => {
        scale.value = withTiming(pressScale, { duration: dur.fast, easing: easing.out });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: dur.fast, easing: easing.out });
      }}
    >
      <Animated.View style={[styles.row, { borderRadius: radius.md }, animated]}>
        <Icon name={item.icon} size={20} color={fg} />
        <View style={styles.rowLabel}>
          <Text variant="body" color={fg}>
            {item.label}
          </Text>
          {item.description ? (
            <Text variant="caption" color={colors.text2}>
              {item.description}
            </Text>
          ) : null}
        </View>
      </Animated.View>
    </Pressable>
  );
}

/**
 * The "…" sheet on a post, an inbox message or a thread: the card, if there is
 * one, then the actions. Untitled on purpose — the card is the title, and the
 * thread variant (no card) is short enough not to need one.
 */
export function MoreSheet({ post, items, onPick, onClose }: MoreSheetProps) {
  return (
    <Sheet onClose={onClose} testID="more-sheet">
      {post ? (
        <PostCard text={post.text} sender={post.sender} time={post.time} source={post.source} />
      ) : null}
      <View style={styles.list}>
        {items.map((it) => (
          <ActionRow key={it.id} item={it} onPress={() => onPick(it.id)} />
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: { flexDirection: 'column' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 52,
    paddingVertical: 0,
    paddingHorizontal: 4,
  },
  // A column, so an item with a description stacks label over caption.
  rowLabel: { flex: 1, minWidth: 0, flexDirection: 'column', gap: 2, paddingVertical: 8 },
});

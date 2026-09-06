import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTranslation } from '../../i18n';
import {
  countBump,
  ink,
  postIn,
  reactBurst,
  reactBurstRotate,
  useEventColor,
  useMotion,
  useTheme,
} from '../../theme';
import {
  AnonymityBadge,
  type AnonymityHints,
  type AnonymityLevel,
} from '../anonymity/AnonymityBadge';
import { Button, type ButtonVariant } from '../core/Button';
import { Chip } from '../core/Chip';
import { type IconName } from '../core/Icon';
import { IconButton } from '../core/IconButton';
import { Text } from '../core/Text';

/** The fixed reaction set. Never extended per event — one set, everywhere. */
export const REACTIONS = ['🔥', '😂', '❤️', '👀', '😳'] as const;
export type Reaction = (typeof REACTIONS)[number];

export interface PostCardSender {
  /**
   * The level this ONE post was sent at, from its own row. Anonymity is a
   * display rule; the card never derives it from anything but this prop.
   */
  level: AnonymityLevel;
  name?: string;
  avatar?: string;
  hints?: AnonymityHints;
}

export interface PostCardAction {
  label: string;
  icon?: IconName;
  onPress?: () => void;
  variant?: ButtonVariant;
}

export interface PostCardProps {
  text: string;
  sender?: PostCardSender;
  time?: string;
  /** Event name; renders the "From {source}" chip. */
  source?: string;
  approvedFromBoard?: boolean;
  /** Real counts only — never fabricate a reaction total. */
  reactions?: Record<string, number>;
  myReaction?: string;
  onReact?: (emoji: string) => void;
  onReply?: () => void;
  onMore?: () => void;
  actions?: PostCardAction[];
  /** Wall posts: 22px body instead of 18px. */
  large?: boolean;
  /** Plays post-in; set on a post arriving live on the board. */
  entering?: boolean;
  /** Outlines the card in the ambient event colour (own post / pinned origin). */
  eventOutline?: boolean;
  /** `anonymous` / `hint` are forwarded to the AnonymityBadge. */
  labels?: {
    reply?: string;
    approvedFromBoard?: string;
    from?: string;
    more?: string;
    react?: string;
    anonymous?: string;
    hint?: string;
  };
  /** Extra footer content, rendered after the actions row (LockedCard uses it). */
  children?: React.ReactNode;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** .c-react — one reaction pill. `mine` is ink-900 with white text. */
function ReactionPill({
  emoji,
  count,
  mine,
  onPress,
  testID,
}: {
  emoji: string;
  count: number;
  mine: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const { colors, radius } = useTheme();
  const { dur, easing, reduced } = useMotion();

  const scale = useSharedValue(1);
  const burstScale = useSharedValue(1);
  const burstRotate = useSharedValue(0);
  const bump = useSharedValue(0);

  // @keyframes count-bump is keyed on the count in the web (`key={reactions[e]}`
  // remounts the span); here the value change drives it directly.
  const firstCount = useRef(true);
  useEffect(() => {
    if (firstCount.current) {
      firstCount.current = false;
      return;
    }
    if (!reduced) bump.value = countBump(dur.base);
  }, [count, bump, dur.base, reduced]);

  const pressed = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const burst = useAnimatedStyle(() => ({
    transform: [{ scale: burstScale.value }, { rotate: `${burstRotate.value}deg` }],
  }));
  const bumped = useAnimatedStyle(() => ({ transform: [{ translateY: bump.value }] }));

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${emoji} ${count}`}
      accessibilityState={{ selected: mine }}
      onPress={() => {
        if (!reduced) {
          burstScale.value = reactBurst(dur.slow);
          burstRotate.value = reactBurstRotate(dur.slow);
        }
        onPress();
      }}
      onPressIn={() => {
        // .c-react:active is scale(.94) — its own value, not --press-scale.
        scale.value = withTiming(reduced ? 1 : 0.94, { duration: dur.fast, easing: easing.out });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: dur.fast, easing: easing.out });
      }}
    >
      <Animated.View
        style={[
          styles.react,
          { borderRadius: radius.pill, backgroundColor: mine ? ink[900] : colors.surfaceMuted },
          pressed,
        ]}
      >
        <Animated.Text style={[styles.reactEmoji, burst]}>{emoji}</Animated.Text>
        <Animated.View style={bumped}>
          <Text variant="bodySmStrong" nums color={mine ? ink[0] : colors.text}>
            {count}
          </Text>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

/** .c-tray — the five-emoji picker that replaces the SmilePlus button. */
function Tray({ onReact, testID }: { onReact: (e: string) => void; testID?: string }) {
  const { colors, radius } = useTheme();
  const { dur, easing } = useMotion();

  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(1, { duration: dur.base, easing: easing.out });
  }, [progress, dur.base, easing]);

  const entering = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [postIn.from.opacity, postIn.to.opacity]),
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [postIn.from.translateY, postIn.to.translateY]) },
      { scale: interpolate(progress.value, [0, 1], [postIn.from.scale, postIn.to.scale]) },
    ],
  }));

  return (
    <Animated.View
      testID={testID}
      style={[
        styles.tray,
        { borderRadius: radius.pill, backgroundColor: colors.surface, borderColor: colors.borderStrong },
        entering,
      ]}
    >
      {REACTIONS.map((e) => (
        <Pressable
          key={e}
          accessibilityRole="button"
          accessibilityLabel={e}
          onPress={() => onReact(e)}
          style={[styles.trayButton, { borderRadius: radius.pill }]}
        >
          <Text style={styles.trayEmoji}>{e}</Text>
        </Pressable>
      ))}
    </Animated.View>
  );
}

/**
 * The message card. One shell for the wall, the board and the inbox; only the
 * footer changes with context.
 *
 * The sender is always rendered through `AnonymityBadge` from this post's own
 * `sender` prop, so the level is never ambiguous and never inherited.
 */
export function PostCard({
  text,
  sender = { level: 'anonymous' },
  time,
  source,
  approvedFromBoard = false,
  reactions = {},
  myReaction,
  onReact,
  onReply,
  onMore,
  actions,
  large = false,
  entering = false,
  eventOutline = false,
  labels = {},
  children,
  accessibilityLabel,
  style,
  testID,
}: PostCardProps) {
  const { colors, radius, space } = useTheme();
  const event = useEventColor();
  const { dur, easing } = useMotion();
  const { t } = useTranslation();

  const L = {
    reply: labels.reply ?? (t('board.reply') as string),
    approvedFromBoard: labels.approvedFromBoard ?? (t('wall.approvedFromBoard') as string),
    from: labels.from ?? (t('wall.from') as string),
    more: labels.more ?? (t('common.more') as string),
    react: labels.react ?? (t('board.react') as string),
  };

  const [tray, setTray] = useState(false);

  const react = (e: string) => {
    setTray(false);
    onReact?.(e);
  };

  const shown = REACTIONS.filter((e) => (reactions[e] ?? 0) > 0 || myReaction === e);

  // .c-post--entering { animation: post-in var(--dur-slow) }
  const progress = useSharedValue(entering ? 0 : 1);
  useEffect(() => {
    if (entering) progress.value = withTiming(1, { duration: dur.slow, easing: easing.out });
  }, [entering, progress, dur.slow, easing]);

  const enter = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [postIn.from.opacity, postIn.to.opacity]),
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [postIn.from.translateY, postIn.to.translateY]) },
      { scale: interpolate(progress.value, [0, 1], [postIn.from.scale, postIn.to.scale]) },
    ],
  }));

  // .c-post--event is `border-color:transparent` + `inset 0 0 0 2px var(--event)`.
  // An RN border eats into the box, so the 2px ring is a real border and the
  // padding drops 16 -> 15: edge-to-content stays 17px and nothing shifts.
  const ring = eventOutline
    ? { borderWidth: 2, borderColor: event.cover, padding: space.cardPad - 1 }
    : { borderWidth: 1, borderColor: colors.border, padding: space.cardPad };

  const showFooter = Boolean(onReact || onReply || onMore || shown.length);

  return (
    <Animated.View
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.root,
        { backgroundColor: colors.surface, borderRadius: radius.card },
        ring,
        enter,
        style,
      ]}
    >
      <View style={styles.header}>
        <AnonymityBadge
          level={sender.level}
          name={sender.name}
          avatar={sender.avatar}
          hints={sender.hints}
          labels={labels}
          size="md"
        />
        {time ? (
          <Text variant="caption" color={colors.text3} nums numberOfLines={1} style={styles.time}>
            {time}
          </Text>
        ) : null}
      </View>

      <Text variant={large ? 'postLg' : 'post'} color={colors.text}>
        {text}
      </Text>

      {source || approvedFromBoard ? (
        <View style={styles.meta}>
          {source ? (
            <Chip size="sm" tone="event" icon="Radio">{`${L.from} ${source}`}</Chip>
          ) : null}
          {approvedFromBoard ? (
            <Chip size="sm" icon="BadgeCheck">
              {L.approvedFromBoard}
            </Chip>
          ) : null}
        </View>
      ) : null}

      {showFooter ? (
        <View style={styles.footer}>
          {shown.map((e) => (
            <ReactionPill
              key={e}
              emoji={e}
              count={reactions[e] ?? 0}
              mine={myReaction === e}
              onPress={() => react(e)}
              testID={testID ? `${testID}-react-${e}` : undefined}
            />
          ))}
          {onReact ? (
            tray ? (
              <Tray onReact={react} testID={testID ? `${testID}-tray` : 'post-card-tray'} />
            ) : (
              <IconButton
                icon="SmilePlus"
                label={L.react}
                size="sm"
                onPress={() => setTray(true)}
                testID={testID ? `${testID}-react` : undefined}
              />
            )
          ) : null}
          <View style={styles.spacer} />
          {onReply ? (
            <IconButton
              icon="Reply"
              label={L.reply}
              size="sm"
              onPress={onReply}
              testID={testID ? `${testID}-reply` : undefined}
            />
          ) : null}
          {onMore ? (
            <IconButton
              icon="Ellipsis"
              label={L.more}
              size="sm"
              onPress={onMore}
              testID={testID ? `${testID}-more` : undefined}
            />
          ) : null}
        </View>
      ) : null}

      {actions && actions.length ? (
        <View style={[styles.actions, { borderTopColor: colors.border }]}>
          {actions.map((a, i) => (
            <Button
              key={`${a.label}-${i}`}
              size="sm"
              variant={a.variant ?? (i === 0 ? 'primary' : 'secondary')}
              icon={a.icon}
              onPress={a.onPress}
            >
              {a.label}
            </Button>
          ))}
        </View>
      ) : null}

      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'column', gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  // `flex:none` + `white-space:nowrap` on .c-post__time
  time: { flexGrow: 0, flexShrink: 0 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  footer: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  spacer: { flex: 1 },
  react: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
    paddingLeft: 8,
    paddingRight: 10,
    gap: 5,
  },
  reactEmoji: { fontSize: 16, lineHeight: 16 },
  tray: { flexDirection: 'row', gap: 2, padding: 2, borderWidth: 1, alignSelf: 'flex-start' },
  trayButton: { width: 36, height: 32, alignItems: 'center', justifyContent: 'center' },
  trayEmoji: { fontSize: 18, lineHeight: 22 },
  actions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    paddingTop: 12,
    marginTop: 2,
    borderTopWidth: 1,
  },
});

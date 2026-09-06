import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type WithTimingConfig,
} from 'react-native-reanimated';
import { useTranslation } from '../../i18n';
import { ink, postIn, useMotion, useTheme } from '../../theme';
import { AnonymityBadge, type AnonymityHints, type AnonymityLevel } from '../anonymity/AnonymityBadge';
import { Icon } from '../core/Icon';
import { Text } from '../core/Text';

export type QueueCardState = 'pending' | 'approved' | 'rejected';

export interface QueueCardSender {
  level: AnonymityLevel;
  name?: string;
  avatar?: string;
  hints?: AnonymityHints;
}

export interface QueueCardProps {
  /** 1-based position in the queue; the moderator counts by it. */
  index?: number;
  text: string;
  sender?: QueueCardSender;
  time?: string;
  state?: QueueCardState;
  /** Batch mode: the action row becomes a check circle and the card toggles. */
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  labels?: {
    approve?: string;
    reject?: string;
    select?: string;
    anonymous?: string;
    hint?: string;
  };
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** .c-q--approved / --rejected: the card slides out on the side it went. */
const EXIT_X = 24;

/**
 * One queued room post, built for one thumb: the big green Approve sits on the
 * right (thumb side), the small Reject on the left.
 *
 * **[D8] Rejection is final — there is no un-reject affordance in this
 * component, and none may be added.** A moderator's mis-tap is recovered from
 * the 5-second undo on the rejection toast, before the sender is notified; the
 * Rejected list this card never links to is read-only.
 */
export function QueueCard({
  index,
  text,
  sender = { level: 'anonymous' },
  time,
  state = 'pending',
  selectable = false,
  selected = false,
  onSelect,
  onApprove,
  onReject,
  labels = {},
  style,
  testID,
}: QueueCardProps) {
  const { colors, radius } = useTheme();
  const { dur, easing, pressScale } = useMotion();
  const { t } = useTranslation();

  const L = {
    approve: labels.approve ?? (t('queue.approve') as string),
    reject: labels.reject ?? (t('queue.reject') as string),
    select: labels.select ?? (t('queue.select') as string),
  };

  // animation: post-in var(--dur-slow) both
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(1, { duration: dur.slow, easing: easing.out });
  }, [progress, dur.slow, easing]);

  // .c-q--approved { transform: translateX(24px); opacity: 0 } (rejected: -24px)
  const decided = state === 'pending' ? 0 : state === 'approved' ? 1 : -1;
  const exit = useSharedValue(0);
  useEffect(() => {
    exit.value = withTiming(decided, { duration: dur.slow, easing: easing.out });
  }, [decided, exit, dur.slow, easing]);

  const animated = useAnimatedStyle(() => ({
    opacity:
      interpolate(progress.value, [0, 1], [postIn.from.opacity, postIn.to.opacity]) *
      (1 - Math.abs(exit.value)),
    transform: [
      {
        translateY: interpolate(progress.value, [0, 1], [postIn.from.translateY, postIn.to.translateY]),
      },
      { scale: interpolate(progress.value, [0, 1], [postIn.from.scale, postIn.to.scale]) },
      { translateX: exit.value * EXIT_X },
    ],
  }));

  // .c-q--selected is `inset 0 0 0 2px var(--ink-900)` + a transparent border.
  // RN borders sit inside the box, so the ring is a real 2px border and the
  // padding drops by 1 to keep edge-to-content identical.
  const ring = selected
    ? { borderWidth: 2, borderColor: ink[900], paddingTop: 13, paddingHorizontal: 15, paddingBottom: 11 }
    : { borderWidth: 1, borderColor: colors.border, paddingTop: 14, paddingHorizontal: 16, paddingBottom: 12 };

  const shell = [
    styles.root,
    { backgroundColor: colors.surface, borderRadius: radius.card },
    ring,
    animated,
    style,
  ];

  const body = (
    <>
      <View style={styles.header}>
        {selectable ? (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel={L.select}
            accessibilityState={{ checked: selected }}
            onPress={onSelect}
            testID={testID ? `${testID}-check` : undefined}
            style={[
              styles.check,
              {
                backgroundColor: selected ? ink[900] : colors.surface,
                borderColor: selected ? ink[900] : colors.borderStrong,
              },
            ]}
          >
            {selected ? <Icon name="Check" size={14} strokeWidth={3} color={ink[0]} /> : null}
          </Pressable>
        ) : null}
        {index != null ? (
          <Text variant="displaySm" color={colors.text3} nums style={styles.index}>
            {index}
          </Text>
        ) : null}
        <AnonymityBadge
          level={sender.level}
          name={sender.name}
          avatar={sender.avatar}
          hints={sender.hints}
          labels={{ anonymous: labels.anonymous, hint: labels.hint }}
          size="sm"
        />
        {time ? (
          <Text variant="caption" color={colors.text3} nums numberOfLines={1} style={styles.time}>
            {time}
          </Text>
        ) : null}
      </View>

      <Text variant="post" color={colors.text}>
        {text}
      </Text>

      {!selectable ? (
        <View style={styles.actions}>
          <DecisionButton
            testID={testID ? `${testID}-reject` : undefined}
            accessibilityLabel={L.reject}
            background={colors.dangerSoft}
            foreground={colors.danger}
            icon="X"
            iconStrokeWidth={2.5}
            onPress={onReject}
            pressScale={pressScale}
            duration={dur.fast}
            easing={easing.out}
            style={styles.reject}
          />
          {/* The only place green is a button: Approve is the one green target
              in the whole product, so a moderator's thumb never has to aim. */}
          <DecisionButton
            testID={testID ? `${testID}-approve` : undefined}
            accessibilityLabel={L.approve}
            label={L.approve}
            background={colors.live}
            foreground={ink[950]}
            icon="Check"
            iconStrokeWidth={2.75}
            onPress={onApprove}
            pressScale={pressScale}
            duration={dur.fast}
            easing={easing.out}
            style={styles.approve}
          />
        </View>
      ) : null}
    </>
  );

  // .c-q--selectable: the whole card is the toggle.
  if (selectable) {
    return (
      <Pressable
        testID={testID}
        accessibilityRole="checkbox"
        accessibilityLabel={L.select}
        accessibilityState={{ checked: selected }}
        onPress={onSelect}
      >
        <Animated.View style={shell}>{body}</Animated.View>
      </Pressable>
    );
  }

  return (
    <Animated.View testID={testID} style={shell}>
      {body}
    </Animated.View>
  );
}

/** .c-q__btn — 52px pill with the press scale. */
function DecisionButton({
  label,
  accessibilityLabel,
  background,
  foreground,
  icon,
  iconStrokeWidth,
  onPress,
  pressScale,
  duration,
  easing: ease,
  style,
  testID,
}: {
  label?: string;
  accessibilityLabel: string;
  background: string;
  foreground: string;
  icon: 'X' | 'Check';
  iconStrokeWidth: number;
  onPress?: () => void;
  pressScale: number;
  duration: number;
  easing: NonNullable<WithTimingConfig['easing']>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { radius } = useTheme();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onPressIn={() => {
        scale.value = withTiming(pressScale, { duration, easing: ease });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration, easing: ease });
      }}
      style={style}
    >
      <Animated.View
        style={[styles.button, { backgroundColor: background, borderRadius: radius.pill }, animated]}
      >
        <Icon name={icon} size={22} strokeWidth={iconStrokeWidth} color={foreground} />
        {label ? (
          <Text variant="bodyStrong" color={foreground} numberOfLines={1}>
            {label}
          </Text>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'column', gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  index: { minWidth: 28 },
  // margin-left:auto in .c-q__time
  time: { marginLeft: 'auto', flexGrow: 0, flexShrink: 0 },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 0,
    flexShrink: 0,
  },
  // grid-template-columns: 56px 1fr
  actions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  reject: { width: 56, flexGrow: 0, flexShrink: 0 },
  approve: { flex: 1 },
  button: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});

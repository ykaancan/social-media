import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTranslation } from '../../i18n';
import { ink, useMotion, useTheme } from '../../theme';
import { Icon } from '../core/Icon';
import { Text } from '../core/Text';

/** Past this many px the gesture commits. */
export const SWIPE_THRESHOLD = 90;
/** The card never travels further than this. */
export const SWIPE_CLAMP = 150;
/** Horizontal dead zone before the pan takes over from a scroll. */
export const SWIPE_DEAD_ZONE = 8;

export interface SwipeProps {
  onApprove: () => void;
  onReject: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Card travel, clamped to ±150px. */
export function clampSwipe(dx: number): number {
  'worklet';
  return Math.max(-SWIPE_CLAMP, Math.min(SWIPE_CLAMP, dx));
}

/**
 * What a release at `dx` decides. Pure, and the single definition of the
 * threshold — the bed's fill and the commit read the same number.
 *
 * **[D8]** `'reject'` is final: nothing in this component un-rejects, and the
 * moderator's recovery path is the 5-second undo on the rejection toast.
 */
export function swipeDecision(dx: number): 'approve' | 'reject' | null {
  'worklet';
  if (dx > SWIPE_THRESHOLD) return 'approve';
  if (dx < -SWIPE_THRESHOLD) return 'reject';
  return null;
}

/**
 * Swipe-to-decide, wrapped around a QueueCard in the moderation queue: right
 * approves, left rejects, and a coloured bed fills in behind the card as the
 * thumb travels.
 *
 * Tap suppression after a drag needs no `onClickCapture` equivalent here: once
 * the pan gesture activates (past the 8px dead zone) gesture-handler cancels
 * the touch for the children, so a Pressable inside never fires from a drag.
 */
export function Swipe({ onApprove, onReject, disabled = false, children, style, testID }: SwipeProps) {
  const { colors, radius } = useTheme();
  const { dur, easing, reduced } = useMotion();
  const { t } = useTranslation();

  const dx = useSharedValue(0);

  const pan = Gesture.Pan()
    .enabled(!disabled)
    // the 8px horizontal dead zone…
    .activeOffsetX([-SWIPE_DEAD_ZONE, SWIPE_DEAD_ZONE])
    // …and vertical drags are rejected outright, so the list still scrolls.
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      dx.value = clampSwipe(e.translationX);
    })
    .onEnd(() => {
      const decision = swipeDecision(dx.value);
      if (decision === 'approve') runOnJS(onApprove)();
      else if (decision === 'reject') runOnJS(onReject)();
      dx.value = withTiming(0, { duration: dur.base, easing: easing.out });
    })
    .onFinalize(() => {
      // A cancelled gesture still has to put the card back.
      if (dx.value !== 0) dx.value = withTiming(0, { duration: dur.base, easing: easing.out });
    });

  const card = useAnimatedStyle(() => ({ transform: [{ translateX: dx.value }] }));

  const bed = useAnimatedStyle(() => {
    const pct = Math.min(1, Math.abs(dx.value) / SWIPE_THRESHOLD);
    return {
      opacity: dx.value ? 0.35 + pct * 0.65 : 0,
      backgroundColor: dx.value > 0 ? colors.live : colors.dangerSoft,
    };
  });
  // The web animates `justify-content` between flex-start and flex-end; RN
  // cannot animate a layout prop, so both sides are always laid out (approve
  // at the start, reject pushed to the end) and only their opacity switches.

  const glyph = useAnimatedStyle(() => {
    const pct = Math.min(1, Math.abs(dx.value) / SWIPE_THRESHOLD);
    return { transform: [{ scale: reduced ? 1 : 0.8 + pct * 0.3 }] };
  });

  const approveSide = useAnimatedStyle(() => ({ opacity: dx.value > 0 ? 1 : 0 }));
  const rejectSide = useAnimatedStyle(() => ({ opacity: dx.value < 0 ? 1 : 0 }));
  // The label only appears once the gesture is past the commit threshold.
  const label = useAnimatedStyle(() => ({
    opacity: Math.abs(dx.value) >= SWIPE_THRESHOLD ? 1 : 0,
  }));

  return (
    <View testID={testID} style={[styles.root, style]}>
      <Animated.View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.bed, { borderRadius: radius.card }, bed]}
      >
        <Animated.View style={[styles.side, approveSide]}>
          <Animated.View style={glyph}>
            <Icon name="Check" size={24} strokeWidth={2.75} color={ink[950]} />
          </Animated.View>
          <Animated.View style={label}>
            <Text variant="bodyStrong" color={ink[950]} numberOfLines={1}>
              {t('queue.approve')}
            </Text>
          </Animated.View>
        </Animated.View>
        <Animated.View style={[styles.side, styles.sideEnd, rejectSide]}>
          <Animated.View style={label}>
            <Text variant="bodyStrong" color={colors.danger} numberOfLines={1}>
              {t('queue.reject')}
            </Text>
          </Animated.View>
          <Animated.View style={glyph}>
            <Icon name="X" size={24} strokeWidth={2.75} color={colors.danger} />
          </Animated.View>
        </Animated.View>
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View style={card}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'relative', flexGrow: 0, flexShrink: 0 },
  bed: {
    pointerEvents: 'none',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    overflow: 'hidden',
  },
  side: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sideEnd: { marginLeft: 'auto' },
});

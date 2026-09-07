import React, { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { ink, postIn, useMotion, useTheme } from '../../theme';
import { Button } from '../core/Button';
import { Text } from '../core/Text';

export interface CoachMarkProps {
  /** `--body-strong`, white on the ink bubble. Already translated. */
  title: string;
  /** `--body-sm` in `--ink-300`. */
  body: string;
  /** The dismiss button's label — "Got it". */
  dismissLabel: string;
  onDismiss: () => void;
  /** Where the tail points, in px from the left edge. Defaults to the prototype's 60. */
  tailOffset?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** The CSS triangle: a 0x0 box with transparent sides and a coloured top border. */
const TAIL = 10;

/**
 * The one-time coach mark on the empty Events screen: an ink-900 bubble with a
 * triangle tail pointing at the thumb zone below it.
 *
 * It is the app's only tooltip, and it is dismissed by hand — never on a timer,
 * never twice. Positioning is the screen's job (the prototype pins it 158px up
 * from the bottom, clear of the bar); this component is just the bubble.
 *
 * The entrance is `post-in` (§1.7), driven exactly like PostCard's, so reduced
 * motion collapses the duration to 0 through `useMotion()` and it simply
 * appears. The bubble is fixed ink, not `--event`: §1.3 reserves the covers for
 * events, and this mark belongs to the app shell.
 */
export function CoachMark({
  title,
  body,
  dismissLabel,
  onDismiss,
  tailOffset = 60,
  style,
  testID,
}: CoachMarkProps) {
  const { radius } = useTheme();
  const { dur, easing } = useMotion();

  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(1, { duration: dur.slow, easing: easing.out });
  }, [progress, dur.slow, easing]);

  const entering = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [postIn.from.opacity, postIn.to.opacity]),
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [postIn.from.translateY, postIn.to.translateY]) },
      { scale: interpolate(progress.value, [0, 1], [postIn.from.scale, postIn.to.scale]) },
    ],
  }));

  return (
    <Animated.View testID={testID} style={[styles.root, entering, style]}>
      <View style={[styles.bubble, { backgroundColor: ink[900], borderRadius: radius.card }]}>
        <Text variant="bodyStrong" color={ink[0]}>
          {title}
        </Text>
        <Text variant="bodySm" color={ink[300]}>
          {body}
        </Text>
        {/* wrapped rather than `alignSelf` on the Button: Button's `style` lands
            on its inner box, so the Pressable itself would still stretch and
            swallow taps across the whole bubble. */}
        <View style={styles.dismiss}>
          <Button size="sm" variant="secondary" onPress={onDismiss}>
            {dismissLabel}
          </Button>
        </View>
      </View>
      <View style={[styles.tail, { borderTopColor: ink[900], marginLeft: tailOffset }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'flex-start' },
  bubble: { width: '100%', gap: 10, paddingVertical: 14, paddingHorizontal: 16 },
  dismiss: { alignSelf: 'flex-end' },
  tail: {
    width: 0,
    height: 0,
    borderStyle: 'solid',
    borderLeftWidth: TAIL,
    borderRightWidth: TAIL,
    borderTopWidth: TAIL,
    borderBottomWidth: 0,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
  },
});

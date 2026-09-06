import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { ink, useMotion, useTheme } from '../../theme';
import { Text } from './Text';

export interface SwitchProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  /** Without a label the bare track is rendered, as on the web. */
  label?: string;
  description?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * `.b-sw` — settings toggle. Deliberately not RN's <Switch>: the platform
 * control cannot be sized (48x28 track, 22px knob, 20px travel) or coloured to
 * the token palette, and the knob's --ease-pop travel is the whole feel of it.
 */
export function Switch({ checked = false, onChange, label, description, style, testID }: SwitchProps) {
  const { colors } = useTheme();
  const { dur, easing } = useMotion();

  // Two shared values, because the CSS gives the two properties different
  // easings: background is --ease-out, the knob's transform is --ease-pop.
  const tint = useSharedValue(checked ? 1 : 0);
  const travel = useSharedValue(checked ? 1 : 0);

  useEffect(() => {
    const to = checked ? 1 : 0;
    tint.value = withTiming(to, { duration: dur.base, easing: easing.out });
    travel.value = withTiming(to, { duration: dur.base, easing: easing.pop });
  }, [checked, dur.base, easing.out, easing.pop, tint, travel]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(tint.value, [0, 1], [ink[200], colors.primary]),
  }));

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(travel.value, [0, 1], [0, 20]) }],
  }));

  const toggle = () => onChange?.(!checked);

  const track = (
    <Animated.View
      testID={testID ? `${testID}-track` : undefined}
      style={[styles.track, trackStyle]}
    >
      <Animated.View style={[styles.knob, knobStyle]} />
    </Animated.View>
  );

  if (!label) {
    return (
      <Pressable
        testID={testID}
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked }}
        onPress={toggle}
        style={style}
      >
        {track}
      </Pressable>
    );
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityState={{ checked }}
      onPress={toggle}
      style={[styles.row, style]}
    >
      <View style={styles.txt}>
        <Text variant="body" color={colors.text}>
          {label}
        </Text>
        {description ? (
          <Text variant="bodySm" color={colors.text2}>
            {description}
          </Text>
        ) : null}
      </View>
      {track}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    minHeight: 44, // --tap-min
  },
  txt: { flexDirection: 'column', gap: 2, flexShrink: 1 },
  track: {
    width: 48,
    height: 28,
    borderRadius: 14,
    flexGrow: 0,
    flexShrink: 0,
  },
  knob: {
    position: 'absolute',
    top: 3,
    left: 3,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.25)',
  },
});

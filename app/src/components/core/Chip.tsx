import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useEventColor, useMotion, useTheme } from '../../theme';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type ChipTone = 'neutral' | 'outline' | 'event' | 'live';
export type ChipSize = 'sm' | 'md';

export interface ChipProps {
  /** A string (the usual case, e.g. "ESN Ankara · Türkiye") or ready-made nodes. */
  children?: React.ReactNode;
  icon?: IconName;
  selected?: boolean;
  tone?: ChipTone;
  size?: ChipSize;
  /** Present → the chip is a toggle button; absent → a static tag. */
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** .b-chip / .b-chip--sm */
const SIZES = {
  md: { height: 32, paddingHorizontal: 12, gap: 6, fontSize: 14, icon: 15 },
  sm: { height: 26, paddingHorizontal: 10, gap: 4, fontSize: 12, icon: 13 },
} as const;

/**
 * Pill chip. Static tag by default; a toggle when `onPress` is given.
 *
 * Port note: the web stylesheet puts `--outline` / `--live` *after*
 * `--selected`, so `outline + selected` there keeps the selected foreground on
 * a transparent background (unreadable). We apply the tone first and let
 * `selected` win, which is what every call site actually wants.
 */
export function Chip({
  children,
  icon,
  selected = false,
  tone = 'neutral',
  size = 'md',
  onPress,
  style,
  testID,
}: ChipProps) {
  const { colors, radius } = useTheme();
  const event = useEventColor();
  const { dur, easing, pressScale } = useMotion();
  const s = SIZES[size];

  let background = colors.surfaceMuted;
  let foreground = colors.text;
  let borderColor = 'transparent';

  if (tone === 'outline') background = 'transparent';
  else if (tone === 'event') background = event.soft;
  else if (tone === 'live') background = colors.liveSoft;

  if (tone === 'outline') borderColor = colors.borderStrong;

  if (selected) {
    if (tone === 'event') {
      background = event.cover;
      foreground = event.onCover;
      borderColor = event.cover;
    } else {
      background = colors.primary;
      foreground = colors.onPrimary;
      borderColor = colors.primary;
    }
  }

  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const body = (
    <>
      {icon ? <Icon name={icon} size={s.icon} strokeWidth={2.25} color={foreground} /> : null}
      {typeof children === 'string' || typeof children === 'number' ? (
        <Text
          variant="bodySmStrong"
          color={foreground}
          numberOfLines={1}
          style={{ fontSize: s.fontSize, lineHeight: Math.round(s.fontSize * 1.4) }}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </>
  );

  const box: ViewStyle = {
    height: s.height,
    paddingHorizontal: s.paddingHorizontal,
    gap: s.gap,
    borderRadius: radius.chip,
    backgroundColor: background,
    borderColor,
  };

  if (!onPress) {
    return (
      <View testID={testID} style={[styles.root, box, style]}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      onPressIn={() => {
        scale.value = withTiming(pressScale, { duration: dur.fast, easing: easing.out });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: dur.fast, easing: easing.out });
      }}
      style={styles.press}
    >
      <Animated.View style={[styles.root, box, animated, style]}>{body}</Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    // the CSS border is 1.5px solid transparent in every state, so the chip
    // never changes size when it becomes selected
    borderWidth: 1.5,
    alignSelf: 'flex-start',
  },
  press: { alignSelf: 'flex-start' },
});

import React, { useEffect } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Figtree_600SemiBold, useEventColor, useMotion, useTheme } from '../../theme';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'event';
export type ButtonSize = 'sm' | 'md' | 'lg';

const SIZES: Record<ButtonSize, { height: number; paddingHorizontal: number; fontSize: number }> = {
  sm: { height: 36, paddingHorizontal: 14, fontSize: 14 },
  md: { height: 44, paddingHorizontal: 18, fontSize: 15 },
  lg: { height: 52, paddingHorizontal: 24, fontSize: 16 },
};

export interface ButtonProps {
  children?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  disabled?: boolean;
  /** Stretch to the container width (.b-btn--full). */
  full?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** 16px ring with a transparent right side, 0.7s linear, forever. */
function Spinner({ color }: { color: string }) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    // Not reduced-motion gated: like the live pulse, this is a status
    // indicator — a frozen spinner would say "stuck", not "working".
    rotation.value = withRepeat(withTiming(360, { duration: 700, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(rotation);
  }, [rotation]);

  const animated = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.spinner, { borderColor: color, borderRightColor: 'transparent' }, animated]}
    />
  );
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading = false,
  disabled = false,
  full = false,
  onPress,
  accessibilityLabel,
  style,
  testID,
}: ButtonProps) {
  const { colors, radius } = useTheme();
  const event = useEventColor();
  const { dur, easing, pressScale } = useMotion();

  const isDisabled = disabled || loading;
  const sizing = SIZES[size];
  const iconSize = size === 'sm' ? 16 : 18;

  // No hover on mobile, so the CSS :hover background changes are dropped;
  // press feedback is the scale transform only, as specified.
  const skin: { background: string; foreground: string; borderWidth?: number; borderColor?: string } =
    variant === 'primary'
      ? { background: colors.primary, foreground: colors.onPrimary }
      : variant === 'secondary'
        ? {
            background: colors.surface,
            foreground: colors.text,
            borderWidth: 1.5, // the CSS uses an inset 1.5px box-shadow
            borderColor: colors.borderStrong,
          }
        : variant === 'ghost'
          ? { background: 'transparent', foreground: colors.text }
          : variant === 'danger'
            ? { background: colors.dangerSoft, foreground: colors.danger }
            : { background: event.cover, foreground: event.onCover };

  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? children}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      onPressIn={() => {
        scale.value = withTiming(pressScale, { duration: dur.fast, easing: easing.out });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: dur.fast, easing: easing.out });
      }}
      style={full ? styles.full : undefined}
    >
      <Animated.View
        style={[
          styles.root,
          {
            height: sizing.height,
            paddingHorizontal: sizing.paddingHorizontal,
            borderRadius: radius.button,
            backgroundColor: skin.background,
            opacity: isDisabled ? 0.4 : 1,
          },
          skin.borderWidth ? { borderWidth: skin.borderWidth, borderColor: skin.borderColor } : null,
          full ? styles.full : null,
          animated,
          style,
        ]}
      >
        {loading ? (
          <Spinner color={skin.foreground} />
        ) : icon ? (
          <Icon name={icon} size={iconSize} strokeWidth={2.25} color={skin.foreground} />
        ) : null}
        {children == null ? null : (
          <Text
            variant="bodyStrong"
            color={skin.foreground}
            numberOfLines={1}
            style={{
              fontFamily: Figtree_600SemiBold,
              fontSize: sizing.fontSize,
              lineHeight: Math.round(sizing.fontSize * 1.45),
            }}
          >
            {children}
          </Text>
        )}
        {iconRight && !loading ? (
          <Icon name={iconRight} size={iconSize} strokeWidth={2.25} color={skin.foreground} />
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'flex-start',
  },
  full: { alignSelf: 'stretch', width: '100%' },
  spinner: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
});

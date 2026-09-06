import React, { useEffect } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { ink, postIn, useMotion, useTheme } from '../../theme';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type ToastTone = 'neutral' | 'warn' | 'danger' | 'live';

/** `const ICONS` in Toast.jsx */
const TONE_ICONS: Record<ToastTone, IconName> = {
  neutral: 'Check',
  warn: 'TriangleAlert',
  danger: 'CircleX',
  live: 'Radio',
};

export interface ToastProps {
  message: string;
  /** Label of the trailing pill button. */
  action?: string;
  onAction?: () => void;
  tone?: ToastTone;
  /** `null` hides the icon; omit it to get the tone's default glyph. */
  icon?: IconName | null;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * `.b-toast` — confirmations, screening warnings and "n new posts" nudges.
 *
 * Presentational only. Positioning it above the thumb zone is the screen's job,
 * exactly as on the web, so there is no host or portal here.
 */
export function Toast({ message, action, onAction, tone = 'neutral', icon, style, testID }: ToastProps) {
  const { colors, radius, shadows } = useTheme();
  const { dur, easing } = useMotion();
  const { width } = useWindowDimensions();

  const skin =
    tone === 'warn'
      ? { background: colors.warning, foreground: ink[950], action: 'rgba(0, 0, 0, 0.1)' }
      : tone === 'danger'
        ? { background: colors.danger, foreground: '#fff', action: 'rgba(255, 255, 255, 0.12)' }
        : tone === 'live'
          ? { background: colors.live, foreground: ink[950], action: 'rgba(0, 0, 0, 0.1)' }
          : { background: ink[900], foreground: ink[0], action: 'rgba(255, 255, 255, 0.12)' };

  const glyph = icon === null ? null : (icon ?? TONE_ICONS[tone]);

  // animation:post-in var(--dur-slow) var(--ease-out), run once on mount.
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(1, { duration: dur.slow, easing: easing.out });
  }, [dur.slow, easing.out, progress]);

  const animated = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: postIn.from.translateY * (1 - progress.value) },
      { scale: postIn.from.scale + (1 - postIn.from.scale) * progress.value },
    ],
  }));

  return (
    <Animated.View
      testID={testID}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        styles.root,
        {
          borderRadius: radius.md,
          backgroundColor: skin.background,
          boxShadow: shadows.toast,
          maxWidth: width - 32, // calc(100vw - 32px)
        },
        animated,
        style,
      ]}
    >
      {glyph ? <Icon name={glyph} size={18} strokeWidth={2.25} color={skin.foreground} /> : null}

      <Text variant="bodySmStrong" color={skin.foreground} style={styles.msg}>
        {message}
      </Text>

      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action}
          onPress={onAction}
          style={[styles.action, { backgroundColor: skin.action, borderRadius: radius.pill }]}
        >
          <Text variant="bodySmStrong" color={skin.foreground} numberOfLines={1}>
            {action}
          </Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start', // inline-flex
    gap: 10,
    minHeight: 48,
    paddingTop: 10,
    paddingRight: 12,
    paddingBottom: 10,
    paddingLeft: 14,
  },
  msg: { flex: 1 },
  action: {
    height: 32,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 0,
    flexShrink: 0,
  },
});

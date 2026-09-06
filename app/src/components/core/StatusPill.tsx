import React, { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useLocale, useTranslation, type Locale } from '../../i18n';
import {
  captionCapsTrackingEm,
  ink,
  livePulseOpacity,
  livePulseRing,
  livePulseScale,
  tracking,
  useMotion,
  useTheme,
  withAlpha,
} from '../../theme';
import { Text } from './Text';

/** `.b-sp--lg` — 13px instead of captionCaps' 11px. */
export const LG_FONT_SIZE = 13;
/** captionCaps is `700 11px/1.2`; the lg size keeps that 1.2 ratio. */
export const LG_LINE_HEIGHT = Math.round(LG_FONT_SIZE * 1.2);

export type StatusName = 'live' | 'upcoming' | 'archived' | 'pending' | 'rejected' | 'onwall';
export type StatusPillSize = 'md' | 'lg';

export interface StatusPillProps {
  status?: StatusName;
  /** Overrides the localized `status.<status>` label. */
  label?: string;
  /**
   * The pill's own locale, for the default label AND for the uppercasing.
   * Defaults to the app locale. A card that carries its own locale (EventCard)
   * passes it through, so a Turkish card inside an English app still folds
   * "Canli" to the dotted-capital-safe "CANLI".
   */
  locale?: Locale;
  size?: StatusPillSize;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The @keyframes live-pulse recipe from theme/motion.ts: a ring behind the dot
 * that expands and fades, forever. `color` is a parameter because the amber
 * "waiting" dot and PendingState's current step reuse it.
 */
export function PulseDot({
  size,
  color,
  testID,
  style,
  children,
}: {
  size: number;
  color: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  /** The thing the ring pulses behind — drawn on top of it. */
  children?: React.ReactNode;
}) {
  const { dur } = useMotion();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  useEffect(() => {
    scale.value = livePulseScale(dur.pulse);
    opacity.value = livePulseOpacity(dur.pulse);
    return () => {
      cancelAnimation(scale);
      cancelAnimation(opacity);
    };
  }, [dur.pulse, scale, opacity]);

  const ring = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));

  return (
    <View testID={testID} style={[{ width: size, height: size }, style]}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: size / 2,
            backgroundColor: withAlpha(color, livePulseRing.alpha),
            pointerEvents: 'none',
          },
          ring,
        ]}
      />
      {children}
    </View>
  );
}

/** .b-sp__dot — 8px ink-950 disc with the live pulse behind it. */
function LiveDot({ testID }: { testID?: string }) {
  return (
    <PulseDot size={8} color={ink[950]} testID={testID}>
      <View style={styles.liveDot} />
    </PulseDot>
  );
}

export function StatusPill({
  status = 'upcoming',
  label,
  locale,
  size = 'md',
  style,
  testID,
}: StatusPillProps) {
  const { colors, radius } = useTheme();
  const { t } = useTranslation();
  const appLocale = useLocale();
  const lng = locale ?? appLocale;

  const skin: { background: string; foreground: string; borderColor?: string } =
    status === 'live'
      ? { background: colors.live, foreground: ink[950] }
      : status === 'upcoming'
        ? { background: colors.surfaceMuted, foreground: colors.text }
        : status === 'archived'
          ? { background: 'transparent', foreground: colors.text3, borderColor: colors.borderStrong }
          : status === 'pending'
            ? { background: colors.warningSoft, foreground: ink[900] }
            : status === 'rejected'
              ? { background: colors.dangerSoft, foreground: colors.danger }
              : { background: ink[900], foreground: '#ffffff' };

  const lg = size === 'lg';
  // `size="lg"` overrides captionCaps' 11px with 13px. Overriding fontSize
  // alone would leave the token's 13px lineHeight behind and clip the caps at
  // ratio 1.0, so the line height is rescaled by the same captionCaps ratio.
  const fontSize = lg ? LG_FONT_SIZE : undefined;
  const lineHeight = lg ? LG_LINE_HEIGHT : undefined;

  return (
    <View
      testID={testID}
      style={[
        styles.root,
        {
          height: lg ? 32 : 24,
          paddingHorizontal: lg ? 14 : 10,
          borderRadius: radius.pill,
          backgroundColor: skin.background,
        },
        // .b-sp--archived's inset box-shadow becomes a real (inside) border;
        // the height is fixed, so nothing shifts.
        skin.borderColor ? { borderWidth: 1, borderColor: skin.borderColor } : null,
        style,
      ]}
    >
      {status === 'live' ? <LiveDot testID={testID ? `${testID}-dot` : 'status-pill-dot'} /> : null}
      <Text
        variant="captionCaps"
        color={skin.foreground}
        upper
        locale={lng}
        numberOfLines={1}
        style={
          fontSize
            ? { fontSize, lineHeight, letterSpacing: tracking(captionCapsTrackingEm, fontSize) }
            : null
        }
      >
        {label ?? (t(`status.${status}`, { lng }) as string)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: ink[950] },
});

import React from 'react';
import { Image, StyleSheet, Text as RNText, View, type StyleProp, type ViewStyle } from 'react-native';
import { avatarTints, BarlowCondensed_700Bold, useTheme } from '../../theme';
import { upper } from '../../utils/text';

export const AVATAR_SIZES = { xs: 20, sm: 28, md: 36, lg: 48, xl: 72 } as const;

export type AvatarSize = keyof typeof AVATAR_SIZES | number;

/**
 * Stable name -> tint index. Same hash as the web Avatar.jsx (h = h*31 + code,
 * unsigned) so a person keeps the same colour across web prototypes and the app.
 * The tints themselves are oklch(0.9 0.06 H) for the eight cover hues.
 */
export function tintIndexFor(name = ''): number {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % avatarTints.length;
}

export function tintFor(name = ''): string {
  return avatarTints[tintIndexFor(name)];
}

/**
 * First character of a name, uppercased Turkish-aware: "ırmak" -> "I",
 * "irem" -> the dotted capital. Returns '' for an empty name.
 */
export function initialFor(name = ''): string {
  return upper(name.trim().charAt(0), 'tr');
}

export interface AvatarProps {
  name?: string;
  /** Photo URI. Stage 1 has no upload, but walls show existing profile photos. */
  src?: string;
  size?: AvatarSize;
  style?: StyleProp<ViewStyle>;
}

export function Avatar({ name = '', src, size = 'md', style }: AvatarProps) {
  const { colors } = useTheme();
  const px = typeof size === 'number' ? size : AVATAR_SIZES[size];
  const initial = initialFor(name);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={name || undefined}
      style={[
        styles.root,
        {
          width: px,
          height: px,
          borderRadius: px / 2,
          backgroundColor: src ? colors.surfaceMuted : tintFor(name),
        },
        style,
      ]}
    >
      {src ? (
        <Image source={{ uri: src }} resizeMode="cover" style={styles.image} accessibilityIgnoresInvertColors />
      ) : (
        <RNText
          allowFontScaling={false}
          style={{
            fontFamily: BarlowCondensed_700Bold,
            fontSize: Math.round(px * 0.46),
            lineHeight: Math.round(px * 0.46),
            includeFontPadding: false,
            color: '#171717', // ink-900, fixed: the tints are always light
          }}
        >
          {initial}
        </RNText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 },
  image: { width: '100%', height: '100%' },
});

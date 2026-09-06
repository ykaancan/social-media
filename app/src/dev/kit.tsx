/**
 * Dev chrome for the component gallery.
 *
 * The gallery is dev-only and therefore exempt from i18n ([D1] calls it "the RN
 * equivalent of the bundle's *.card.html specimens"): its own labels are
 * hard-coded English, exactly like the `<span className="lbl">` captions in the
 * web cards. Everything INSIDE a specimen still comes from i18n or from the
 * fixtures.
 */

import React from 'react';
import { Platform, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from '../components/core';
import { useTheme } from '../theme';

/** Every specimen caption carries this, so the gallery test can count them. */
export const CAPTION_TEST_ID = 'specimen-caption';

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

/**
 * One `<span className="lbl">` from a web specimen: 10.5px monospace in `text2`,
 * sitting directly above the thing it names.
 */
export function Caption({ children }: { children: string }) {
  const { colors } = useTheme();
  return (
    <Text testID={CAPTION_TEST_ID} variant="caption" color={colors.text2} style={styles.caption}>
      {children}
    </Text>
  );
}

/** `.st` — a vertical stack. */
export function Stack({
  gap,
  style,
  children,
}: {
  gap?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const { space } = useTheme();
  return <View style={[{ gap: gap ?? space.s3 }, style]}>{children}</View>;
}

/** `.g` — a horizontal, wrapping cluster. */
export function Cluster({
  gap,
  style,
  children,
}: {
  gap?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const { space } = useTheme();
  return <View style={[styles.cluster, { gap: gap ?? space.s2 }, style]}>{children}</View>;
}

/** A caption plus the specimen it names. */
export function Specimen({
  label,
  gap,
  children,
}: {
  label: string;
  gap?: number;
  children: React.ReactNode;
}) {
  const { space } = useTheme();
  return (
    <View style={{ gap: space.s2 }}>
      <Caption>{label}</Caption>
      <Stack gap={gap}>{children}</Stack>
    </View>
  );
}

/** One group of specimens, with the heading the jump chips scroll to. */
export function GallerySection({
  id,
  title,
  subtitle,
  onLayout,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  onLayout?: (e: LayoutChangeEvent) => void;
  children: React.ReactNode;
}) {
  const { colors, space } = useTheme();
  return (
    <View onLayout={onLayout} style={{ gap: space.s5, paddingVertical: space.s6 }}>
      <View style={[styles.heading, { borderBottomColor: colors.borderStrong }]}>
        <Text testID={`gallery-section-${id}`} variant="displaySm">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color={colors.text2} style={styles.caption}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={{ gap: space.s6 }}>{children}</View>
    </View>
  );
}

/** A framed slot, for specimens that need a surface behind them (bubbles). */
export function Frame({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors, radius, space } = useTheme();
  return (
    <View
      style={[
        {
          gap: space.s2,
          padding: space.s3,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: colors.border,
          borderRadius: radius.card,
          backgroundColor: colors.surface,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  caption: { fontFamily: MONO, fontSize: 10.5, lineHeight: 14, letterSpacing: 0 },
  cluster: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  heading: { gap: 2, paddingBottom: 8, borderBottomWidth: 1 },
});

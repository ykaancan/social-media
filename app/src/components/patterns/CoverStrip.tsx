import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { coverNames, covers } from '../../theme';

export interface CoverStripProps {
  /** `md` is the splash strip (22x6, gap 6); `sm` is the sign-up one (14x6, gap 5). */
  size?: 'md' | 'sm';
  /** The sign-up header centres its strip over the title. */
  centered?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const BARS = {
  md: { width: 22, height: 6, gap: 6 },
  sm: { width: 14, height: 6, gap: 5 },
} as const;

/**
 * The eight event cover colours as a strip of bars — the splash's and sign-up's
 * only ornament, and the app's one promise that colour means "event".
 *
 * The order is `coverNames`, the canonical order from §1.3 that the splash
 * strip and the create-event picker share; it is read from the theme, never
 * re-listed here, so a token change moves both.
 *
 * Purely decorative: it carries no meaning a screen reader needs.
 */
export function CoverStrip({ size = 'md', centered = false, style, testID }: CoverStripProps) {
  const bar = BARS[size];

  return (
    <View
      testID={testID}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.root, { gap: bar.gap }, centered ? styles.centered : null, style]}
    >
      {coverNames.map((name) => (
        <View
          key={name}
          testID={testID ? `${testID}-${name}` : undefined}
          style={{
            width: bar.width,
            height: bar.height,
            borderRadius: 3,
            backgroundColor: covers[name].cover,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center' },
  centered: { justifyContent: 'center' },
});

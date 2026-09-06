import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useEventColor, useTheme } from '../../theme';
import { Icon, type IconName } from '../core/Icon';
import { Text } from '../core/Text';

export interface EmptyProps {
  icon: IconName;
  /** One sentence. Already translated — this component never calls t() itself. */
  text: string;
  /**
   * `true` → the event's `--event-soft` from `useEventColor()` (the upcoming
   * board's empty state); a string → that colour verbatim; absent → muted.
   */
  tint?: boolean | string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Icon circle + centred sentence. The web version is rebuilt inline in four
 * prototypes with 64px vs 72px padding and 250 vs 240 maxWidth; the full-app
 * numbers (64/250) win, they are the newest.
 *
 * `text-wrap: balance` on the sentence has no RN equivalent and is dropped.
 */
export function Empty({ icon, text, tint, style, testID }: EmptyProps) {
  const { colors } = useTheme();
  const event = useEventColor();

  const tinted = tint !== undefined && tint !== false;
  const background = tint === true ? event.soft : typeof tint === 'string' ? tint : colors.surfaceMuted;
  // On a tinted circle the glyph carries the event's own contrast, so it steps
  // up from text3 to text — matching the events prototype's tinted specimen.
  const glyph = tinted ? colors.text : colors.text3;

  return (
    <View testID={testID} style={[styles.root, style]}>
      <View style={[styles.circle, { backgroundColor: background }]}>
        <Icon name={icon} size={24} color={glyph} />
      </View>
      <Text variant="body" color={colors.text2} style={styles.text}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: 14, paddingVertical: 64, paddingHorizontal: 24 },
  circle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  text: { textAlign: 'center', maxWidth: 250 },
});

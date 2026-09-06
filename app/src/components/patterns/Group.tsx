import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../theme';
import { Text } from '../core/Text';

export interface GroupProps {
  /** Optional caps label above the card (the events prototype's meaning). */
  label?: string;
  /**
   * The card radius. `'card'` (--r-card, 14) is the default; the sheets' lists
   * in the prototype are --r-md (10), so SectionSheet and ModsSheet ask for
   * `'md'`.
   */
  radius?: 'card' | 'md';
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * `S.group` — the bordered card that wraps a list of Rows, PersonRows or
 * thread rows. It also absorbs the *labelled list* meaning `Group` has in the
 * events prototype, so there is one component, not two with the same name.
 *
 * The separators are drawn here, between children, instead of the web's
 * `borderTop: first ? 0 : …` on every row: nothing has to know its index.
 */
export function Group({ label, radius: radiusName = 'card', children, style, testID }: GroupProps) {
  const { colors, radius, borderWidth } = useTheme();

  // toArray already drops null / undefined / booleans, so `{cond && <Row/>}`
  // never leaves a stray hairline behind.
  const items = React.Children.toArray(children);

  return (
    <View testID={testID} style={[styles.root, style]}>
      {label ? (
        <Text variant="captionCaps" color={colors.text2} upper style={styles.label}>
          {label}
        </Text>
      ) : null}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: borderWidth.base,
            borderRadius: radius[radiusName],
          },
        ]}
      >
        {items.map((child, i) => (
          <React.Fragment key={i}>
            {i === 0 ? null : (
              <View style={{ height: borderWidth.base, backgroundColor: colors.border }} />
            )}
            {child}
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  label: { paddingHorizontal: 2 },
  // `overflow: hidden` clips the children to the rounded corners, which is what
  // makes the first/last row's background stop at the radius.
  card: { overflow: 'hidden' },
});

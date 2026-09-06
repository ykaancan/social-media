import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../theme';
import { Icon, type IconName } from '../core/Icon';
import { Text } from '../core/Text';

export interface RowProps {
  icon?: IconName;
  label: string;
  /** Right-aligned current value, e.g. "Anyone", "English". Never wraps. */
  value?: string;
  /** The settings prototype's `children` slot: a second line under the label. */
  description?: string;
  onPress?: () => void;
  danger?: boolean;
  /** Trailing glyph becomes ExternalLink (privacy policy, VERBİS, …). */
  external?: boolean;
  /** Defaults to "shown when the row is pressable and has no `right`". */
  chevron?: boolean;
  /** Replaces the chevron (a Switch, a StatusPill, a count …). */
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The settings list row. Draws NO hairline of its own — `Group` puts the
 * separators between its children, so a Row is reusable outside a Group and
 * nobody has to pass the web's `first` prop.
 *
 * Press feedback is a `surfaceMuted` background flash rather than the
 * house scale animation: a full-bleed row inside an `overflow: hidden` Group
 * would scale away from the card's edges and show the surface behind it.
 */
export function Row({
  icon,
  label,
  value,
  description,
  onPress,
  danger = false,
  external = false,
  chevron,
  right,
  style,
  testID,
}: RowProps) {
  const { colors } = useTheme();

  const foreground = danger ? colors.danger : colors.text;
  const showChevron = chevron ?? (!!onPress && right == null);

  const body = (
    <>
      {icon ? <Icon name={icon} size={20} color={danger ? colors.danger : colors.text2} style={styles.fixed} /> : null}
      <View style={styles.labels}>
        <Text variant="body" color={foreground}>
          {label}
        </Text>
        {description ? (
          <Text variant="caption" color={colors.text2}>
            {description}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant="caption" color={colors.text2} numberOfLines={1} style={styles.fixed}>
          {value}
        </Text>
      ) : null}
      {right ?? null}
      {showChevron ? (
        <Icon
          name={external ? 'ExternalLink' : 'ChevronRight'}
          size={18}
          color={colors.text3}
          style={styles.fixed}
        />
      ) : null}
    </>
  );

  if (!onPress) {
    return (
      <View testID={testID} style={[styles.root, { backgroundColor: colors.surface }, style]}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={description}
      onPress={onPress}
      style={({ pressed }) => [
        styles.root,
        { backgroundColor: pressed ? colors.surfaceMuted : colors.surface },
        style,
      ]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  labels: { flex: 1, minWidth: 0, gap: 2 },
  fixed: { flexGrow: 0, flexShrink: 0 },
});

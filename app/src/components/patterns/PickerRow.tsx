import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useMotion, useTheme } from '../../theme';
import { Icon, type IconName } from '../core/Icon';
import { Text } from '../core/Text';

export interface PickerRowProps {
  /** `--body-sm-strong`, above the row — the same label an `Input` draws. */
  label: string;
  icon: IconName;
  /** The chosen value. Absent → the placeholder in `--text-3`. */
  value?: string;
  placeholder: string;
  /** `--caption` under the row. */
  hint?: string;
  onPress?: () => void;
  /** [D11] The Country row: filled from the section, never picked. */
  locked?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The bordered field row that opens a sheet — "Your section" on profile setup —
 * and, `locked`, the same row rendered read-only for Country.
 *
 * [D11] Country is not an independent field: it is read through the section and
 * shown read-only. The locked variant is therefore not a disabled control that
 * might one day be enabled; it is a value display shaped like a field so the
 * form still reads as one column. It drops the border for `--surface-muted`, is
 * not pressable at all, and shows a `Lock` only once there is something locked.
 */
export function PickerRow({
  label,
  icon,
  value,
  placeholder,
  hint,
  onPress,
  locked = false,
  style,
  testID,
}: PickerRowProps) {
  const { colors, radius } = useTheme();
  const { dur, easing, pressScale } = useMotion();

  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const field = (
    <>
      <Icon name={icon} size={18} color={colors.text2} style={styles.fixed} />
      <Text numberOfLines={1} color={value ? colors.text : colors.text3} style={styles.value}>
        {value ?? placeholder}
      </Text>
      {locked ? (
        value ? (
          <Icon name="Lock" size={16} color={colors.text3} style={styles.fixed} />
        ) : null
      ) : (
        <Icon name="ChevronDown" size={18} color={colors.text3} style={styles.fixed} />
      )}
    </>
  );

  return (
    <View testID={testID} style={[styles.root, style]}>
      <Text variant="bodySmStrong">{label}</Text>

      {locked ? (
        <View
          testID={testID ? `${testID}-field` : undefined}
          style={[styles.field, { backgroundColor: colors.surfaceMuted, borderRadius: radius.input }]}
        >
          {field}
        </View>
      ) : (
        <Pressable
          testID={testID ? `${testID}-field` : undefined}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityValue={{ text: value ?? placeholder }}
          onPress={onPress}
          onPressIn={() => {
            scale.value = withTiming(pressScale, { duration: dur.fast, easing: easing.out });
          }}
          onPressOut={() => {
            scale.value = withTiming(1, { duration: dur.fast, easing: easing.out });
          }}
        >
          <Animated.View
            style={[
              styles.field,
              {
                backgroundColor: colors.surface,
                borderRadius: radius.input,
                // the web's inset 1.5px box-shadow, same as Button secondary
                borderWidth: 1.5,
                borderColor: colors.borderStrong,
              },
              animated,
            ]}
          >
            {field}
          </Animated.View>
        </Pressable>
      )}

      {hint ? (
        <Text variant="caption" color={colors.text2}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 6 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 14 },
  value: { flex: 1, minWidth: 0 },
  fixed: { flexGrow: 0, flexShrink: 0 },
});

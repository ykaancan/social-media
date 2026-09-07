import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { ink, useTheme } from '../../theme';
import { Avatar } from '../core/Avatar';
import { Icon } from '../core/Icon';
import { Text } from '../core/Text';

export interface PhotoPickerProps {
  /** The chosen photo's URI. Absent → the dashed empty state. */
  uri?: string | null;
  /** Used for the Avatar's initial fallback while the photo loads. */
  name?: string;
  /** Already translated, e.g. `onboarding.photo`. */
  label: string;
  /** The caption under it: "Real face, please. An admin checks it once." */
  hint?: string;
  onPress: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The profile photo control from the profile-setup screen: a 60px circle, a
 * 24px ink badge on its corner, and the label + caption beside it.
 *
 * It does NOT open the OS picker — the screen owns expo-image-picker and the
 * permission prompt, and hands back a `uri`. That keeps the library free of
 * native modules and lets the gallery render both states.
 *
 * Deviation, inherited from the prototype: the empty circle is 60px but the
 * filled state is `Avatar size="xl"`, which is 72 in the bundle's own Avatar,
 * so the control grows when a photo is picked. The prototype does exactly this;
 * it is kept rather than quietly "fixed" so the gallery matches the screenshot.
 */
export function PhotoPicker({
  uri,
  name,
  label,
  hint,
  onPress,
  accessibilityLabel,
  style,
  testID,
}: PhotoPickerProps) {
  const { colors, borderWidth } = useTheme();

  return (
    <View testID={testID} style={[styles.root, style]}>
      <Pressable
        testID={testID ? `${testID}-button` : undefined}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={hint}
        onPress={onPress}
        style={styles.control}
      >
        {uri ? (
          <Avatar name={name ?? ''} src={uri} size="xl" />
        ) : (
          <View
            style={[
              styles.empty,
              { backgroundColor: colors.surfaceMuted, borderColor: colors.borderStrong },
            ]}
          >
            <Icon name="Camera" size={22} color={colors.text3} />
          </View>
        )}
        {/* the web's `box-shadow: 0 0 0 2px var(--bg)` ring, as a real border */}
        <View
          style={[
            styles.badge,
            { backgroundColor: ink[900], borderColor: colors.bg, borderWidth: borderWidth.strong },
          ]}
        >
          <Icon name={uri ? 'Pencil' : 'Plus'} size={13} strokeWidth={2.5} color={ink[0]} />
        </View>
      </Pressable>

      <View style={styles.labels}>
        <Text variant="bodySmStrong">{label}</Text>
        {hint ? (
          <Text variant="caption" color={colors.text2}>
            {hint}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  control: { position: 'relative' },
  empty: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  badge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labels: { flex: 1, minWidth: 0, gap: 2 },
});

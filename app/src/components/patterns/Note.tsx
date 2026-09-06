import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../theme';
import { Icon, type IconName } from '../core/Icon';
import { Text } from '../core/Text';

export interface NoteProps {
  /** Defaults to Info, like every prototype's `Note`. */
  icon?: IconName;
  /** A string (wrapped in Text) or ready-made nodes. */
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** `S.note` — a quiet explanatory line on `--surface-muted`. Never an alert. */
export function Note({ icon = 'Info', children, style, testID }: NoteProps) {
  const { colors, radius } = useTheme();

  return (
    <View
      testID={testID}
      style={[styles.root, { borderRadius: radius.md, backgroundColor: colors.surfaceMuted }, style]}
    >
      <Icon name={icon} size={16} color={colors.text2} style={styles.icon} />
      <View style={styles.body}>
        {typeof children === 'string' || typeof children === 'number' ? (
          <Text variant="bodySm" color={colors.text2}>
            {children}
          </Text>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, paddingHorizontal: 14 },
  // the web `flex: none` + `marginTop: 2` optical nudge onto the first line
  icon: { marginTop: 2, flexGrow: 0, flexShrink: 0 },
  body: { flex: 1, minWidth: 0 },
});

import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useLocale, useTranslation } from '../../i18n';
import { Figtree_500Medium, useTheme } from '../../theme';
import { Avatar } from '../core/Avatar';
import { Icon } from '../core/Icon';
import { Text } from '../core/Text';
import { lower } from '../../utils/text';

export interface Person {
  id?: string;
  name: string;
  /** [D11] The section carries the country; there is no separate field. */
  section?: string;
  country?: string;
  /** Photo URI. */
  avatar?: string;
}

export interface PersonRowProps {
  person: Person;
  /** Appends " · you" after the name. */
  me?: boolean;
  /** Defaults to `person.section`; the board's People tab passes "sec · country". */
  sub?: string;
  /** Replaces the chevron (a Check in the picker, a Remove button in ModsSheet). */
  right?: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Roster row: avatar, name (+ "· you"), section. Used by the People tab, the
 * section roster, the blocked list and PersonPicker — always inside a `Group`,
 * which draws the hairlines, so this row has none.
 */
export function PersonRow({ person, me = false, sub, right, onPress, style, testID }: PersonRowProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const locale = useLocale();

  const secondary = sub ?? person.section;

  const body = (
    <>
      <Avatar name={person.name} src={person.avatar} size="md" />
      <View style={styles.labels}>
        <Text variant="bodySmStrong" numberOfLines={1}>
          {person.name}
          {me ? (
            <Text variant="bodySm" color={colors.text3} style={styles.you}>
              {` · ${lower(t('common.you'), locale)}`}
            </Text>
          ) : null}
        </Text>
        {secondary ? (
          <Text variant="caption" color={colors.text2} numberOfLines={1}>
            {secondary}
          </Text>
        ) : null}
      </View>
      {right ?? (onPress ? <Icon name="ChevronRight" size={18} color={colors.text3} style={styles.fixed} /> : null)}
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
      accessibilityLabel={person.name}
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
    minHeight: 60,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  labels: { flex: 1, minWidth: 0 },
  // the web's `fontWeight: 500` inside a 600 name — weight is a FAMILY here
  you: { fontFamily: Figtree_500Medium },
  fixed: { flexGrow: 0, flexShrink: 0 },
});

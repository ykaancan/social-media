import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../theme';
import { normalizeForSearch } from '../../utils/text';
import { Icon } from '../core/Icon';
import { Input } from '../core/Input';
import { Text } from '../core/Text';
import { PersonRow, type Person } from './PersonRow';

/**
 * A person the picker can select. `Person.id` is optional on a roster row, but
 * a picker has to tell two people apart, so it is required here. `country` is
 * read through the section ([D11]) — the picker never asks for a nationality.
 */
export interface PickerPerson extends Person {
  id: string;
}

export interface PersonPickerProps {
  members: PickerPerson[];
  value?: PickerPerson;
  onPick: (person: PickerPerson) => void;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
}

/** The web's `overflow-y:auto` list height. */
const LIST_MAX_HEIGHT = 220;

/**
 * Search + a short scrolling list of people. Used by the composer to pick the
 * person a board post is addressed to.
 *
 * Matching goes through `normalizeForSearch` ([D10]) on both sides, so "irem"
 * finds "İrem" and "bogazici" finds "Boğaziçi" — the same normaliser the muted
 * words and the section search use, and the one the server must mirror.
 */
export function PersonPicker({ members, value, onPick, placeholder, style }: PersonPickerProps) {
  const { colors, radius } = useTheme();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  const list = useMemo(() => {
    const q = normalizeForSearch(query);
    return q ? members.filter((m) => normalizeForSearch(m.name).includes(q)) : members;
  }, [members, query]);

  return (
    <View style={[styles.root, style]}>
      <Input
        value={query}
        onChange={setQuery}
        placeholder={placeholder ?? t('composer.searchJoined')}
        testID="person-picker-search"
      />

      {/* The border stays put and the rows scroll inside it, like the web's
          `max-height + overflow-y:auto` on the bordered group. That is why this
          is not a `Group`: a Group cannot host its own scroll region, so the
          hairlines are applied to the rows instead. */}
      <View
        style={[
          styles.list,
          { borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
        ]}
      >
        {/* This list lives inside a `Sheet`, whose body is itself a ScrollView.
            On Android a nested vertical ScrollView is inert without
            `nestedScrollEnabled`; without `keyboardShouldPersistTaps` the first
            tap after typing only dismisses the keyboard. */}
        <ScrollView
          testID="person-picker-list"
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
          style={styles.scroll}
        >
          {list.map((m, i) => (
            <PersonRow
              key={m.id}
              person={m}
              onPress={() => onPick(m)}
              right={
                value && value.id === m.id ? (
                  <Icon name="Check" size={18} strokeWidth={2.5} />
                ) : (
                  // An empty node, not `undefined`: PersonRow would otherwise
                  // fall back to a chevron, which the web picker does not show.
                  <View />
                )
              }
              style={i ? [styles.hairline, { borderTopColor: colors.border }] : undefined}
            />
          ))}
          {list.length === 0 ? (
            <Text variant="bodySm" color={colors.text2} style={styles.empty}>
              {t('composer.noOneHere')}
            </Text>
          ) : null}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'column', gap: 8 },
  list: { borderWidth: 1, overflow: 'hidden' },
  scroll: { maxHeight: LIST_MAX_HEIGHT },
  hairline: { borderTopWidth: 1 },
  empty: { padding: 14 },
});

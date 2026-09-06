import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../theme';
import { normalizeForSearch } from '../../utils/text';
import { Icon } from '../core/Icon';
import { Input } from '../core/Input';
import { Sheet } from '../core/Sheet';
import { Text } from '../core/Text';
import { Group } from './Group';

export interface SectionOption {
  id: string;
  name: string;
  /** [D11] the country the section sits in — picking a section picks this too. */
  country: string;
  members: number;
}

export interface SectionSheetProps {
  sections: SectionOption[];
  /** The currently chosen section's id. */
  value?: string;
  onPick: (section: SectionOption) => void;
  onClose: () => void;
}

/**
 * The section picker, used at sign-up and from Settings.
 *
 * [D11] Country is not an independent field: it is read through the section, so
 * picking a section is picking a country too — which is why the list is grouped
 * by country and the search matches either. [D7] Changing it later is allowed,
 * logged and rate-limited; the sheet itself does not re-enter the approval
 * queue, and the screen owns saying so.
 *
 * [D10] Matching goes through `normalizeForSearch` on both sides — the same
 * normaliser as people search and muted words, mirrored server-side.
 */
export function SectionSheet({ sections, value, onPick, onClose }: SectionSheetProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const q = normalizeForSearch(query);
    const byCountry = new Map<string, SectionOption[]>();
    for (const s of sections) {
      const hit = !q || normalizeForSearch(s.name).includes(q) || normalizeForSearch(s.country).includes(q);
      if (!hit) continue;
      const bucket = byCountry.get(s.country);
      if (bucket) bucket.push(s);
      else byCountry.set(s.country, [s]);
    }
    return [...byCountry.entries()].map(([country, items]) => ({ country, items }));
  }, [sections, query]);

  return (
    <Sheet title={t('onboarding.section')} onClose={onClose} style={styles.sheet} testID="section-sheet">
      <Input
        value={query}
        onChange={setQuery}
        placeholder={t('section.searchPlaceholder')}
        autoFocus
        testID="section-search"
      />

      <Text variant="bodySm" color={colors.text2}>
        {t('section.tagNote')}
      </Text>

      <View style={styles.groups}>
        {groups.map((g) => (
          <Group key={g.country} label={g.country} radius="md" testID={`section-group-${g.country}`}>
            {g.items.map((s) => {
              const selected = value === s.id;
              return (
                <Pressable
                  key={s.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={s.name}
                  testID={`section-${s.id}`}
                  onPress={() => onPick(s)}
                  style={[
                    styles.row,
                    { backgroundColor: selected ? colors.surfaceMuted : colors.surface },
                  ]}
                >
                  <Text variant="body" numberOfLines={1} style={styles.rowName}>
                    {s.name}
                  </Text>
                  <Text variant="caption" color={colors.text2} nums>
                    {String(s.members)}
                  </Text>
                  {selected ? <Icon name="Check" size={18} strokeWidth={2.5} /> : null}
                </Pressable>
              );
            })}
          </Group>
        ))}

        {groups.length === 0 ? (
          <Text variant="caption" color={colors.text2} style={styles.empty}>
            {t('section.noneFound')}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheet: { maxHeight: '90%' },
  groups: { flexDirection: 'column', gap: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingVertical: 0,
    paddingHorizontal: 14,
  },
  rowName: { flex: 1, minWidth: 0 },
  empty: { padding: 8 },
});

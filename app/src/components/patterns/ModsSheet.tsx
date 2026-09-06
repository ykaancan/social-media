import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocale, useTranslation } from '../../i18n';
import { useTheme } from '../../theme';
import { Avatar } from '../core/Avatar';
import { Button } from '../core/Button';
import { Icon } from '../core/Icon';
import { IconButton } from '../core/IconButton';
import { Input } from '../core/Input';
import { Sheet } from '../core/Sheet';
import { Text } from '../core/Text';
import { lower, normalizeForSearch } from '../../utils/text';
import { Group } from './Group';
import { PersonRow } from './PersonRow';
import type { PickerPerson } from './PersonPicker';
import { firstName } from './ReplySheet';

export interface ModsSheetProps {
  me: PickerPerson;
  creator: PickerPerson;
  /** Co-moderators, creator excluded. */
  mods: PickerPerson[];
  /** Joined members who are neither the creator nor already a co-moderator. */
  pool: PickerPerson[];
  eventName: string;
  onAdd: (person: PickerPerson) => void;
  onRemove: (person: PickerPerson) => void;
  onClose: () => void;
}

/**
 * Who moderates this board. Two views in one sheet: the current moderators, and
 * the add-a-co-moderator search.
 *
 * `event_moderator` is a role on the event, never a hardcoded user
 * (CLAUDE.md §Roles). Co-moderators share the queue and can hide posts; they
 * cannot see identities, cannot ban, and cannot change board settings — which
 * is exactly what the note under the list says. The creator's row has no remove
 * button: an event without its creator has no owner.
 */
export function ModsSheet({
  me,
  creator,
  mods,
  pool,
  eventName,
  onAdd,
  onRemove,
  onClose,
}: ModsSheetProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const locale = useLocale();

  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');

  const matches = useMemo(() => {
    const q = normalizeForSearch(query);
    return q ? pool.filter((p) => normalizeForSearch(p.name).includes(q)) : pool;
  }, [pool, query]);

  const rows = [
    { person: creator, role: t('events.creator'), removable: false },
    ...mods
      .filter((m) => m.id !== creator.id)
      .map((m) => ({ person: m, role: t('events.coModerator'), removable: true })),
  ];

  return (
    <Sheet
      title={adding ? t('events.addCoModerator') : t('events.moderators')}
      onClose={adding ? () => setAdding(false) : onClose}
      style={styles.sheet}
      testID="mods-sheet"
    >
      {adding ? (
        <>
          <Input
            value={query}
            onChange={setQuery}
            placeholder={t('events.searchJoinedMods')}
            autoFocus
            testID="mods-search"
          />
          <Text variant="caption" color={colors.text2}>
            {t('events.onlyJoinedCanModerate', { name: eventName })}
          </Text>
          {matches.length ? (
            <Group radius="md" testID="mods-pool">
              {matches.map((m) => (
                <PersonRow
                  key={m.id}
                  person={m}
                  onPress={() => {
                    onAdd(m);
                    setAdding(false);
                    setQuery('');
                  }}
                  right={<Icon name="Plus" size={18} strokeWidth={2.5} />}
                  testID={`mods-add-${m.id}`}
                />
              ))}
            </Group>
          ) : (
            <Text variant="bodySm" color={colors.text2} style={styles.empty}>
              {t('events.noOneJoined')}
            </Text>
          )}
        </>
      ) : (
        <>
          <View style={styles.list}>
            {rows.map(({ person, role, removable }) => (
              <View key={person.id} style={styles.modRow}>
                <Avatar name={person.name} src={person.avatar} size="md" />
                <View style={styles.modText}>
                  <Text variant="bodySmStrong" numberOfLines={1}>
                    {person.name}
                    {person.id === me.id ? (
                      <Text variant="bodySm" color={colors.text3}>
                        {` · ${lower(t('common.you'), locale)}`}
                      </Text>
                    ) : null}
                  </Text>
                  <Text variant="caption" color={colors.text2} numberOfLines={1}>
                    {`${role} · ${person.section ?? ''}`.replace(/ · $/, '')}
                  </Text>
                </View>
                {removable ? (
                  <IconButton
                    icon="X"
                    size="sm"
                    label={t('events.remove', { name: firstName(person.name) })}
                    onPress={() => onRemove(person)}
                    testID={`mods-remove-${person.id}`}
                  />
                ) : null}
              </View>
            ))}
          </View>

          <Text variant="caption" color={colors.text2}>
            {t('events.modsNote')}
          </Text>

          <Button
            size="lg"
            full
            variant="secondary"
            icon="UserPlus"
            onPress={() => setAdding(true)}
            testID="mods-add"
          >
            {t('events.addCoModerator')}
          </Button>
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheet: { maxHeight: '88%' },
  list: { flexDirection: 'column' },
  modRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingVertical: 6,
    paddingHorizontal: 0,
  },
  modText: { flex: 1, minWidth: 0 },
  empty: { padding: 14 },
});

import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useApi, type SectionDetail } from '../api';
import { Button, Icon, Text } from '../components/core';
import { Back, Empty, Group, Note, PersonRow, Screen } from '../components/patterns';
import { useTranslation } from '../i18n';
import type { RootScreenProps } from '../navigation/types';
import { useSession } from '../session';
import { useTheme } from '../theme';

/**
 * The section page — `screen === "section"` in
 * `prototypes/onboarding-app.jsx` (HANDOFF §6.1) and `renderSection` in
 * `prototypes/full-app.jsx`.
 *
 * Sections are membership tags, not tenants: there is no moderator, no join,
 * no posting surface, and the `Note` says so out loud. The only thing this
 * screen does is show who else carries the tag.
 *
 * [D11] The country is read through the section — it is where the person sits
 * in the network, not a nationality, and it is never picked on its own.
 *
 * It is pushed on the ROOT stack, so the tab bar is hidden while it is up [D2].
 */

type Load =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; section: SectionDetail };

export function SectionScreen({ navigation, route }: RootScreenProps<'Section'>) {
  const { id } = route.params;
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const api = useApi();
  const { me } = useSession();

  const [load, setLoad] = useState<Load>({ status: 'loading' });

  const fetch = useCallback(() => {
    let alive = true;
    setLoad({ status: 'loading' });
    api.getSection(id).then(
      (section) => {
        if (alive) setLoad({ status: 'ready', section });
      },
      // Every failure reads the same to the person: the roster is not here.
      // Which HTTP code it was belongs in a log, not on a screen.
      () => {
        if (alive) setLoad({ status: 'error' });
      },
    );
    return () => {
      alive = false;
    };
  }, [api, id]);

  useEffect(fetch, [fetch]);

  const header = <Back onBack={() => navigation.goBack()} />;

  // Nothing at all while it loads: a skeleton of a roster would be a picture of
  // people who may not be in this section.
  if (load.status === 'loading') return <Screen header={header}>{null}</Screen>;

  if (load.status === 'error') {
    return (
      <Screen header={header}>
        <Empty testID="section-error" icon="Flag" text={t('onboarding.errorNetwork')} />
        <View style={styles.retry}>
          <Button testID="section-retry" variant="secondary" size="md" onPress={fetch}>
            {t('common.retry')}
          </Button>
        </View>
      </Screen>
    );
  }

  const { section } = load;
  const more = section.rosterTotal - section.roster.length;

  return (
    <Screen header={header}>
      <View style={styles.title}>
        <Text variant="captionCaps" color={colors.text2} upper>
          {t('section.title')}
        </Text>
        <Text variant="displayLg" upper>
          {section.name}
        </Text>
        <View style={styles.meta}>
          <View style={styles.metaItem}>
            <Icon name="Flag" size={14} strokeWidth={2.25} color={colors.text2} />
            <Text variant="bodySm" color={colors.text2}>
              {section.country}
            </Text>
          </View>
          <View style={styles.metaItem}>
            <Icon name="Users" size={14} strokeWidth={2.25} color={colors.text2} />
            <Text variant="bodySm" color={colors.text2} nums>
              {t('section.members', { n: section.memberCount })}
            </Text>
          </View>
        </View>
      </View>

      {/* Both prototypes give this note the card radius, not `Note`'s own
          --r-md. Passing the radius is the whole override. */}
      <Note icon="Tag" style={{ borderRadius: radius.card }}>
        {t('section.note')}
      </Note>

      {/* Stage 2 puts a "Room" tab here (§4.4b: a section chat room, member-only).
          Nothing is reserved for it — §6.1 is explicit that the page has no Room
          tab and no slot for one yet. */}

      <Group testID="section-roster">
        {section.roster.map((person, i) => (
          <PersonRow
            key={person.id}
            testID={`section-person-${i}`}
            person={{ id: person.id, name: person.name, avatar: person.avatarUrl }}
            me={person.id === me?.id}
          />
        ))}
        {/* No `onPress`: other people's walls arrive in step 5, and PersonRow
            draws no chevron without one — the row says "nothing happens here",
            which is true. */}
        {more > 0 ? (
          <View testID="section-more" style={styles.more}>
            <Text variant="caption" color={colors.text2} nums style={styles.moreText}>
              {t('section.andMore', { n: more })}
            </Text>
          </View>
        ) : null}
      </Group>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { gap: 8 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  retry: { alignItems: 'center' },
  // the prototype's last row inside the card, above Group's own hairline
  more: { paddingVertical: 12, paddingHorizontal: 14, backgroundColor: 'transparent' },
  moreText: { textAlign: 'center' },
});

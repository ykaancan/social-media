import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Avatar, Button, Text } from '../../components/core';
import { BottomBar, CoachMark, Empty, Screen } from '../../components/patterns';
import { useTranslation } from '../../i18n';
import type { TabScreenProps } from '../../navigation/types';
import { useCoachMark } from '../../prefs';
import { useSession } from '../../session';

/**
 * The Events tab — `screen === "events"` in `prototypes/onboarding-app.jsx`
 * (HANDOFF §6.1, "Events (empty)").
 *
 * There is no events API yet, so the list is honestly empty: the empty state
 * IS the screen, not a placeholder standing in for content that exists
 * somewhere. Nothing here invents a card, a count or a date (principle 4).
 */
export function EventsTab({ navigation }: TabScreenProps<'Events'>) {
  const { t } = useTranslation();
  const { me } = useSession();
  const coach = useCoachMark();

  // TODO(step 3): the events query goes here — `api.listMyEvents()`, grouped
  // live / upcoming / archived (§4.4). Until it exists this screen shows the
  // empty state unconditionally, which is the truth.

  const header = (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        <Text variant="displayLg" upper>
          {t('events.title')}
        </Text>
        <Pressable
          testID="events-avatar"
          accessibilityRole="button"
          accessibilityLabel={t('tabs.profile')}
          onPress={() => navigation.navigate('Profile')}
        >
          <Avatar name={me?.name ?? ''} src={me?.avatarUrl} size="sm" />
        </Pressable>
      </View>
    </View>
  );

  const bottom = (
    <>
      {/* The bubble is pinned to the frame, not to the scrolling body, so it
          keeps the prototype's 158px clearance above the thumb zone. It sits in
          `bottom` because that slot is the only child of the frame that is not
          inside the scroller. */}
      {coach.visible ? (
        <CoachMark
          testID="coach-mark"
          title={t('onboarding.coachTitle')}
          body={t('onboarding.coachBody')}
          dismissLabel={t('onboarding.coachDismiss')}
          onDismiss={coach.dismiss}
          tailOffset={60}
          style={styles.coach}
        />
      ) : null}
      <BottomBar row>
        {/* TODO(step 3): JoinSheet / CreateSheet. Both buttons are disabled
            until those flows exist — a button that only raises a "coming soon"
            toast fakes a feature, and principle 4 forbids it. The design is
            drawn and reachable; only the handler is missing. */}
        {/* Prototype: `style={{ flex: 1 }}` on the button itself. Button's
            `style` lands on its inner box, not on the Pressable, so the flex
            has to live on a wrapper — same fix CoachMark uses for alignSelf. */}
        <View style={styles.join}>
          <Button testID="events-join" size="lg" icon="LogIn" full disabled>
            {t('events.join')}
          </Button>
        </View>
        <Button testID="events-create" size="lg" variant="secondary" icon="Plus" disabled>
          {t('events.createShort')}
        </Button>
      </BottomBar>
    </>
  );

  return (
    <Screen header={header} bottom={bottom}>
      <Empty testID="events-empty" icon="CalendarDays" text={t('events.empty')} style={styles.empty} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  // `S.header` / `S.hrow`. A tab root has no Back, so the row is the title and
  // the owner's avatar; `Back` covers the pushed-screen version of the same box.
  header: { paddingTop: 6, paddingHorizontal: 16, paddingBottom: 12 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 44,
  },
  // the prototype's `padding: "88px 24px 0"` — the empty state sits lower here
  // than Empty's own 64px, so the coach mark below it has room.
  empty: { paddingTop: 88, paddingBottom: 0 },
  // above BottomBar's zIndex 5, like the prototype's zIndex 6
  coach: { position: 'absolute', left: 16, right: 16, bottom: 158, zIndex: 6 },
  join: { flex: 1 },
});

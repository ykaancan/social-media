import React from 'react';
import { StyleSheet } from 'react-native';
import { Text } from '../../components/core';
import { Empty, Screen, WallHeader } from '../../components/patterns';
import { useTranslation } from '../../i18n';
import type { TabScreenProps } from '../../navigation/types';
import { useSession } from '../../session';
import { useTheme } from '../../theme';

/**
 * [D2] The Profile tab IS the owner's own wall — `screen === "me"` in
 * `prototypes/onboarding-app.jsx` (HANDOFF §6.1, "My wall").
 *
 * The prototype pushes that screen from Events and so gives it a Back header;
 * here it is a tab root, so the Back is gone and the "My wall" caps label is
 * the first thing in the body, exactly as the prototype has it.
 *
 * No count is passed to `WallHeader`. There is no approved-message count yet,
 * and "0 on the wall" would be a number the app made up (principle 4);
 * `WallHeader` hides the line entirely when `count` is absent.
 */
export function ProfileTab({ navigation }: TabScreenProps<'Profile'>) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { me } = useSession();

  // The tab only exists inside the approved group of the root stack, so `me` is
  // there — but the session type allows null and a render must not depend on
  // routing to be safe.
  const section = me?.section;

  // TODO(step 5): the wall query — approved messages as `PostCard`s, newest
  // first — plus the real `count` on the header.
  // TODO(step 8): the Settings and Share header buttons (§6.8). They are not
  // drawn here because neither screen exists yet.

  return (
    <Screen>
      <Text variant="captionCaps" color={colors.text2} upper>
        {t('wall.myWall')}
      </Text>
      <WallHeader
        testID="profile-wall-header"
        user={{
          name: me?.name ?? '',
          section: section?.name,
          country: section?.country,
          bio: me?.bio,
          avatar: me?.avatarUrl,
        }}
        onSection={section ? () => navigation.navigate('Section', { id: section.id }) : undefined}
        style={styles.header}
      />
      <Empty testID="profile-empty" icon="StickyNote" text={t('wall.emptyOwner')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  // `Screen`'s body already carries the 16px gap; WallHeader's own top padding
  // would double the space under the "My wall" label.
  header: { paddingTop: 0 },
});

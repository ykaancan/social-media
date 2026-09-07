import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { View } from 'react-native';
import {
  LogIn,
  Pending,
  ProfileSetup,
  SectionScreen,
  SignUp,
  Splash,
} from '../screens';
import { useSession } from '../session';
import { useTheme } from '../theme';
import { Shell } from './Shell';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Routing is a function of the session. Rather than guarding screens, each
 * phase registers only the routes it is allowed to reach — a signed-out person
 * has no Shell to navigate to, and a `pending` account has no Events tab in the
 * tree at all. Changing phase swaps the group, and React Navigation resets the
 * history for us.
 *
 * Every screen draws its own header (the `Back` pattern), so the native header
 * is off everywhere.
 *
 * Each group carries a `navigationKey`. Without it, two groups that share a
 * route name (both the incomplete and the pending group own `ProfileSetup`)
 * would keep the current route across the swap, and sending your profile would
 * leave you sitting on the form instead of landing on Pending. Changing the key
 * discards the old group's state.
 */
export function RootNavigator() {
  const { phase, me } = useSession();
  const { colors } = useTheme();

  // Boot: the splash colour and nothing else. No spinner and no "loading" copy —
  // this is normally a single frame, and a message would flash.
  if (phase === 'booting') return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  const status = me?.status;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {phase === 'signedOut' || !me ? (
          <Stack.Group navigationKey="signedOut">
            <Stack.Screen name="Splash" component={Splash} />
            <Stack.Screen name="SignUp" component={SignUp} />
            <Stack.Screen name="LogIn" component={LogIn} />
          </Stack.Group>
        ) : status === 'incomplete' ? (
          // Registered but the profile has not been sent. There is nowhere else
          // to be: no back, no skip.
          <Stack.Group navigationKey="incomplete">
            <Stack.Screen name="ProfileSetup" component={ProfileSetup} />
          </Stack.Group>
        ) : status === 'approved' ? (
          <Stack.Group navigationKey="approved">
            <Stack.Screen name="Shell" component={Shell} />
            <Stack.Screen name="Section" component={SectionScreen} />
            {/* Reached from Settings later; the same screen with `edit: true`. */}
            <Stack.Screen name="ProfileSetup" component={ProfileSetup} />
          </Stack.Group>
        ) : (
          // `pending`, `rejected` and — for now — `banned`.
          // TODO: stage 1 has no designed screen for a banned account. Pending is
          // the least wrong placeholder; give `banned` its own screen (and its own
          // copy) as soon as the design exists.
          // The key carries the status: a `rejected` account that resubmits
          // becomes `pending`, and the key change is what takes it off the
          // ProfileSetup form and back onto Pending.
          <Stack.Group navigationKey={`pending-${status ?? 'unknown'}`}>
            <Stack.Screen name="Pending" component={Pending} />
            {/* [D7]/[D8] A rejected account edits and resubmits from here, which
                returns it to `pending` — there is no separate re-apply flow. */}
            <Stack.Screen name="ProfileSetup" component={ProfileSetup} />
          </Stack.Group>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

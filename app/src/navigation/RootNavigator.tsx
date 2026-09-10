import {Screen,LoadState} from '../components/patterns';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import { ThreadsProvider } from '../threads/ThreadsProvider';
import { ThreadScreen } from '../screens/threads/ThreadScreen';
import { EventProjectorScreen } from '../screens/events/EventProjectorScreen';
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
import { MessagesProvider } from '../messages/MessagesProvider';
import { EventDetailScreen } from '../screens/events/EventDetailScreen';
import { EventCodeScreen } from '../screens/events/EventCodeScreen';
import { EventPersonScreen } from '../screens/events/EventPersonScreen';
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
  const { phase, me, bootError, retryBoot } = useSession();
  const { colors } = useTheme();

  // Boot: the splash colour and nothing else. No spinner and no "loading" copy —
  // this is normally a single frame, and a message would flash.
  if (phase === 'booting') return bootError ? <Screen testID="boot-error"><LoadState error onRetry={()=>{void retryBoot();}}/></Screen> : <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  const status = me?.status;

  return (
    <MessagesProvider key={`${me?.id ?? 'out'}:${status}`}><ThreadsProvider><NavigationContainer>
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
            <Stack.Screen name="Settings" component={SettingsScreen}/>
            <Stack.Screen name="Thread" component={ThreadScreen} />
            <Stack.Screen name="Section" component={SectionScreen} />
            <Stack.Screen name="EventDetail" component={EventDetailScreen} />
            <Stack.Screen name="EventCode" component={EventCodeScreen} />
            <Stack.Screen name="EventProjector" component={EventProjectorScreen} options={{orientation:'landscape',statusBarHidden:true}} />
            <Stack.Screen name="EventPerson" component={EventPersonScreen} />
            {/* Reached from Settings later; the same screen with `edit: true`. */}
            <Stack.Screen name="ProfileSetup" component={ProfileSetup} />
          </Stack.Group>
        ) : (
          // `pending`, `rejected` and — for now — `banned`.
          // Restricted accounts reuse the onboarding shell with status-specific copy.
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
    </NavigationContainer></ThreadsProvider></MessagesProvider>
  );
}

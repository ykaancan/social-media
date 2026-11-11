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
  ConfirmEmail,
  LogIn,
  Pending,
  ProfileSetup,
  SectionScreen,
  SignUp,
  Splash,
} from '../screens';
import { usePushRegistration } from '../push';
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
 * has no Shell to navigate to, and an unconfirmed account has nothing but the
 * Confirm-email screen in the tree at all. Changing phase swaps the group, and
 * React Navigation resets the history for us.
 *
 * The groups, in the order they are decided (acceptance test 28):
 *
 * - signed out → Splash, Sign up, Log in;
 * - `banned` → the restricted screen, whether or not the email was ever
 *   confirmed (the server decides a ban first, too);
 * - `emailConfirmed === false` → Confirm email, and nothing else [D18];
 * - `incomplete` → Profile setup, and nothing else;
 * - `active` → the four-tab shell [D2] and everything pushed on it, with or
 *   without any organisation membership [D14].
 *
 * Every screen draws its own header (the `Back` pattern), so the native header
 * is off everywhere.
 *
 * Each group carries a `navigationKey`. Without it, two groups that share a
 * route name (both the incomplete and the active group own `ProfileSetup`)
 * would keep the current route across the swap, and sending your profile would
 * leave you sitting on the form instead of landing in the shell. Changing the
 * key discards the old group's state.
 */
export function RootNavigator() {
  const { phase, me, bootError, retryBoot } = useSession();
  const { colors } = useTheme();

  // [B8] Registers this phone for notifications while an active, confirmed
  // session is on screen, and unregisters it when that session ends. It renders
  // nothing and it never blocks: a person who declines notifications sees no
  // difference at all.
  usePushRegistration();

  // Boot: the splash colour and nothing else. No spinner and no "loading" copy —
  // this is normally a single frame, and a message would flash.
  if (phase === 'booting') return bootError ? <Screen testID="boot-error"><LoadState error onRetry={()=>{void retryBoot();}}/></Screen> : <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  const status = me?.status;
  const confirmed = me?.emailConfirmed === true;

  return (
    <MessagesProvider key={`${me?.id ?? 'out'}:${status}:${confirmed}`}><ThreadsProvider><NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {phase === 'signedOut' || !me ? (
          <Stack.Group navigationKey="signedOut">
            <Stack.Screen name="Splash" component={Splash} />
            <Stack.Screen name="SignUp" component={SignUp} />
            <Stack.Screen name="LogIn" component={LogIn} />
          </Stack.Group>
        ) : status === 'banned' ? (
          // Restricted accounts reuse the onboarding shell with the restricted copy.
          <Stack.Group navigationKey="banned">
            <Stack.Screen name="Pending" component={Pending} />
          </Stack.Group>
        ) : !confirmed ? (
          // [D18] Until the link is opened the server answers only /me, the
          // auth routes and the resend route; there is nowhere else to be.
          <Stack.Group navigationKey="unconfirmed">
            <Stack.Screen name="ConfirmEmail" component={ConfirmEmail} />
          </Stack.Group>
        ) : status === 'incomplete' ? (
          // Confirmed, profile not sent. No back, no skip.
          <Stack.Group navigationKey="incomplete">
            <Stack.Screen name="ProfileSetup" component={ProfileSetup} />
          </Stack.Group>
        ) : (
          // `active` [D14]: the app, whether or not the account is in any organisation.
          <Stack.Group navigationKey="active">
            <Stack.Screen name="Shell" component={Shell} />
            <Stack.Screen name="Settings" component={SettingsScreen}/>
            <Stack.Screen name="Thread" component={ThreadScreen} />
            <Stack.Screen name="Section" component={SectionScreen} />
            <Stack.Screen name="EventDetail" component={EventDetailScreen} />
            <Stack.Screen name="EventCode" component={EventCodeScreen} />
            <Stack.Screen name="EventProjector" component={EventProjectorScreen} options={{orientation:'landscape',statusBarHidden:true}} />
            <Stack.Screen name="EventPerson" component={EventPersonScreen} />
            {/* Reached from Settings; the same screen with `edit: true`. */}
            <Stack.Screen name="ProfileSetup" component={ProfileSetup} />
          </Stack.Group>
        )}
      </Stack.Navigator>
    </NavigationContainer></ThreadsProvider></MessagesProvider>
  );
}
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

/**
 * The root stack. Which of these routes exist at any moment is decided by the
 * session, not by navigation: see `RootNavigator`. That is why nothing here
 * needs a guard — an unreachable screen is simply not registered.
 *
 * Everything pushed on top of a tab lives HERE rather than inside the tab
 * navigator, which is what makes the tab bar disappear on a pushed screen [D2].
 */
export type RootStackParamList = {
  Settings: {page?:import('../screens/settings/SettingsScreen').SettingsPage}|undefined;
  Splash: undefined;
  SignUp: undefined;
  LogIn: undefined;
  /** `edit: true` when an existing profile is being changed, not first set up. */
  ProfileSetup: { edit?: boolean } | undefined;
  Pending: undefined;
  Shell: NavigatorScreenParams<TabParamList> | undefined;
  Section: { id: string };
  Thread: { id: string };
  EventDetail: { id: string };
  EventProjector: { id: string };
  EventCode: { id: string; created?: boolean };
  EventPerson: { id: string; personId: string };
};

/** [D2] Exactly four tabs, in this order. Profile is the owner's own wall. */
export type TabParamList = {
  Events: undefined;
  Inbox: undefined;
  Threads: undefined;
  Profile: undefined;
};

export type RootScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;

/**
 * A tab screen can also drive the root stack (push Section, open ProfileSetup),
 * so its props are the composite of both navigators.
 */
export type TabScreenProps<T extends keyof TabParamList> = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, T>,
  RootScreenProps<'Shell'>
>;

declare global {
  namespace ReactNavigation {
    // Makes `useNavigation()` typed everywhere without a per-call generic.
    interface RootParamList extends RootStackParamList {}
  }
}

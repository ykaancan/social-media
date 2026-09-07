import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import React from 'react';
import { TabBar, type TabId } from '../components/patterns';
import { EventsTab, InboxTab, ProfileTab, ThreadsTab } from '../screens';
import type { TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();

/** Route name <-> the library's TabId. Two names for one thing, kept adjacent. */
const TAB_ID: Record<keyof TabParamList, TabId> = {
  Events: 'events',
  Inbox: 'inbox',
  Threads: 'threads',
  Profile: 'profile',
};

const ROUTE: Record<TabId, keyof TabParamList> = {
  events: 'Events',
  inbox: 'Inbox',
  threads: 'Threads',
  profile: 'Profile',
};

/**
 * The bar itself is the design system's `TabBar` pattern — the navigator only
 * tells it which tab is current and listens for the change.
 *
 * `badges` is deliberately absent: nothing counts `new` inbox messages or
 * unread threads yet, and principle 4 forbids showing a number we do not have.
 * A later wave passes the real counts.
 */
function ShellTabBar({ state, navigation }: BottomTabBarProps) {
  const current = state.routes[state.index]?.name as keyof TabParamList;

  return (
    <TabBar
      value={TAB_ID[current] ?? 'events'}
      onChange={(id) => {
        const target = ROUTE[id];
        // Emit the standard tabPress first so a screen can intercept it (scroll
        // to top, discard a draft) exactly as it would with the default bar.
        const route = state.routes.find((r) => r.name === target);
        const event = route
          ? navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
          : undefined;
        if (!event?.defaultPrevented) navigation.navigate(target);
      }}
    />
  );
}

/**
 * [D2] The four-tab app shell. Screens pushed on top of a tab belong to the
 * ROOT stack (see `RootStackParamList`), which is what hides this bar while
 * they are up — the bar belongs to the tab root, not to the app.
 */
export function Shell() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props: BottomTabBarProps) => <ShellTabBar {...props} />}
    >
      <Tab.Screen name="Events" component={EventsTab} />
      <Tab.Screen name="Inbox" component={InboxTab} />
      <Tab.Screen name="Threads" component={ThreadsTab} />
      <Tab.Screen name="Profile" component={ProfileTab} />
    </Tab.Navigator>
  );
}

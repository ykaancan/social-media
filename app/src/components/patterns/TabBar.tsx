import React, { useContext } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useTranslation } from '../../i18n';
import { bodyFamily, Figtree_700Bold, ink, useTheme } from '../../theme';
import { Icon, type IconName } from '../core/Icon';
import { Text } from '../core/Text';

/** [D2] The app shell is exactly these four tabs, in this order. */
export type TabId = 'events' | 'inbox' | 'threads' | 'profile';

const TABS: { id: TabId; icon: IconName; key: string }[] = [
  { id: 'events', icon: 'CalendarDays', key: 'tabs.events' },
  { id: 'inbox', icon: 'Inbox', key: 'tabs.inbox' },
  { id: 'threads', icon: 'MessagesSquare', key: 'tabs.threads' },
  { id: 'profile', icon: 'StickyNote', key: 'tabs.profile' },
];

export interface TabBarProps {
  value: TabId;
  onChange: (id: TabId) => void;
  /**
   * [D2] Inbox counts `new` messages (the only state the badge counts) and
   * Threads counts unread threads. Real counts only — never fabricated.
   */
  badges?: Partial<Record<TabId, number>>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };

/**
 * [D2] Bottom navigation: Events · Inbox · Threads · Profile (the owner's own
 * wall). The screen shell HIDES this bar whenever a screen is pushed on top of
 * a tab — the bar is not a fixture, it belongs to the tab root.
 *
 * The web's fixed 84px height is `56 + 6 + 22`; here the 22px bottom band
 * becomes the real safe-area inset (never less than 22), so the labels clear
 * the home indicator on every device.
 */
export function TabBar({ value, onChange, badges, style, testID }: TabBarProps) {
  const { colors, borderWidth } = useTheme();
  const { t } = useTranslation();
  // useSafeAreaInsets() throws without a provider, and the gallery/tests mount
  // this bare — read the context and fall back, exactly like Sheet does.
  const insets = useContext(SafeAreaInsetsContext) ?? NO_INSETS;

  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      style={[
        styles.root,
        {
          backgroundColor: colors.surface,
          borderTopWidth: borderWidth.base,
          borderTopColor: colors.border,
          paddingBottom: Math.max(insets.bottom, 22),
        },
        style,
      ]}
    >
      {TABS.map((tab) => {
        const selected = value === tab.id;
        const n = badges?.[tab.id];
        const label = t(tab.key);
        return (
          <Pressable
            key={tab.id}
            testID={`tab-${tab.id}`}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={label}
            onPress={() => onChange(tab.id)}
            style={styles.tab}
          >
            <View style={styles.glyph}>
              <Icon
                name={tab.icon}
                size={22}
                strokeWidth={selected ? 2.5 : 2}
                color={selected ? colors.text : colors.text3}
              />
              {n ? (
                <View style={[styles.badge, { backgroundColor: ink[900] }]}>
                  <Text nums numberOfLines={1} color={ink[0]} style={styles.badgeText}>
                    {n}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text
              variant="caption"
              color={selected ? colors.text : colors.text3}
              numberOfLines={1}
              style={selected ? styles.labelOn : undefined}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', paddingTop: 6, paddingHorizontal: 8 },
  // four equal columns (the web's `grid-template-columns: repeat(4,1fr)`)
  tab: { flex: 1, height: 56, alignItems: 'center', justifyContent: 'center', gap: 4 },
  glyph: { alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: Figtree_700Bold, fontSize: 11, lineHeight: 18, textAlign: 'center' },
  // selected steps 500 -> 600; weight is a family, never `fontWeight`
  labelOn: { fontFamily: bodyFamily(600) },
});

import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Figtree_700Bold, useTheme } from '../../theme';
import { Text } from './Text';

export type TabsVariant = 'underline' | 'segmented';

export interface TabItem {
  id: string;
  label: string;
  /** Rendered whenever it is not null/undefined — 0 is a real count. */
  count?: number;
  /** A queue that needs attention: red badge whether or not the tab is selected. */
  hot?: boolean;
  disabled?: boolean;
}

export interface TabsProps {
  items?: TabItem[];
  value?: string;
  onChange?: (id: string) => void;
  variant?: TabsVariant;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * `.b-tabs` — `underline` for page sections, `segmented` for mode switches.
 *
 * The segmented variant's `transition:background/color var(--dur-base)` is not
 * animated: both properties switch instantly on selection. A cross-fade would
 * need two stacked copies of every tab for a 200ms tint change nobody watches.
 */
export function Tabs({ items = [], value, onChange, variant = 'underline', style, testID }: TabsProps) {
  const { colors, radius } = useTheme();
  const segmented = variant === 'segmented';

  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      style={[
        styles.root,
        segmented
          ? [styles.segmented, { backgroundColor: colors.surfaceMuted, borderRadius: radius.pill }]
          : [styles.underline, { borderBottomColor: colors.border }],
        style,
      ]}
    >
      {items.map((it) => {
        const selected = value === it.id;
        const fg = selected ? colors.text : colors.text2;

        const countBg = it.hot ? colors.danger : selected ? colors.primary : colors.surfaceMuted;
        const countFg = it.hot ? '#fff' : selected ? colors.onPrimary : colors.text2;

        return (
          <Pressable
            key={it.id}
            testID={testID ? `${testID}-${it.id}` : undefined}
            accessibilityRole="tab"
            accessibilityLabel={it.label}
            accessibilityState={{ selected, disabled: Boolean(it.disabled) }}
            disabled={it.disabled}
            onPress={() => onChange?.(it.id)}
            style={[
              styles.tab,
              segmented
                ? [
                    styles.tabSegmented,
                    { borderRadius: radius.pill },
                    selected
                      ? { backgroundColor: colors.surface, boxShadow: '0 1px 2px rgba(0, 0, 0, 0.08)' }
                      : null,
                  ]
                : styles.tabUnderline,
              it.disabled ? styles.disabled : null,
            ]}
          >
            <Text variant="bodySmStrong" color={fg} numberOfLines={1}>
              {it.label}
            </Text>

            {it.count != null ? (
              <View style={[styles.count, { backgroundColor: countBg }]}>
                <Text nums color={countFg} numberOfLines={1} style={styles.countText}>
                  {String(it.count)}
                </Text>
              </View>
            ) : null}

            {selected && !segmented ? <View style={[styles.bar, { backgroundColor: colors.text }]} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row' },
  underline: { gap: 4, borderBottomWidth: 1 },
  segmented: { padding: 3, gap: 2 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tabUnderline: { paddingVertical: 12, paddingHorizontal: 14, minHeight: 44 },
  tabSegmented: { flex: 1, height: 36, justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  bar: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: -1, // sits on the row's 1px bottom border
    height: 3,
    borderRadius: 2,
  },
  count: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 0,
    flexShrink: 0,
  },
  countText: { fontFamily: Figtree_700Bold, fontSize: 11, lineHeight: 20, textAlign: 'center' },
});

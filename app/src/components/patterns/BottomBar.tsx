import React, { useContext } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';

export interface BottomBarProps {
  children: React.ReactNode;
  /** Side by side instead of stacked — the Events screen's "Join an event" + "Create". */
  row?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };

/** The fade above the bar: `linear-gradient(to bottom, transparent, --bg 20px)`. */
const FADE = 20;

/**
 * `S.bottom` — the thumb zone. One primary action, always within reach; goes in
 * `Screen`'s `bottom` slot, where it floats over the scrolling body.
 *
 * The web draws a 20px gradient so content dissolves into the bar instead of
 * being cut off. RN has no CSS gradient without a dependency, so the ramp is
 * approximated by two 10px strips of `--bg` at rising opacity above a solid
 * block — a two-step staircase instead of a continuous ramp. It reads the same
 * at a glance; swap it for a real gradient if expo-linear-gradient ever lands.
 *
 * The 34px bottom padding in the prototype is a hard-coded iPhone home
 * indicator; here it is the real safe-area inset, floored at 34 so the bar
 * keeps its proportions on a device without one.
 */
export function BottomBar({ children, row = false, style, testID }: BottomBarProps) {
  const { colors } = useTheme();
  // useSafeAreaInsets() throws without a provider, and the gallery mounts this
  // bare — read the context and fall back, exactly like TabBar and Sheet do.
  const insets = useContext(SafeAreaInsetsContext) ?? NO_INSETS;

  return (
    <View
      testID={testID}
      style={[
        styles.root,
        { paddingBottom: Math.max(insets.bottom, 34) },
        row ? styles.row : styles.column,
        style,
      ]}
    >
      <View style={[styles.fadeTop, { backgroundColor: colors.bg }]} />
      <View style={[styles.fadeBottom, { backgroundColor: colors.bg }]} />
      <View style={[styles.solid, { backgroundColor: colors.bg }]} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    // must sit above the ScrollView, like the web's `zIndex: 5`
    zIndex: 5,
    paddingTop: FADE,
    paddingHorizontal: 16,
    gap: 8,
  },
  column: { flexDirection: 'column' },
  row: { flexDirection: 'row' },
  // The three background layers are declared before the children, so they
  // paint behind them, and take no touches of their own.
  fadeTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: FADE / 2,
    opacity: 0.36,
    pointerEvents: 'none',
  },
  fadeBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: FADE / 2,
    height: FADE / 2,
    opacity: 0.72,
    pointerEvents: 'none',
  },
  solid: { position: 'absolute', left: 0, right: 0, top: FADE, bottom: 0, pointerEvents: 'none' },
});

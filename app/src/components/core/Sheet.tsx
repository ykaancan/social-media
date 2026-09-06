import React, { useCallback, useContext, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useTranslation } from '../../i18n';
import { ink, useMotion, useTheme } from '../../theme';
import { IconButton } from './IconButton';
import { Text } from './Text';

export interface SheetProps {
  open?: boolean;
  title?: string;
  /** When given, the header shows a close button and the scrim is tappable. */
  onClose?: () => void;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Overrides the i18n default for the close button's label. */
  labels?: { close?: string };
  testID?: string;
}

const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };

/**
 * `.b-sheet` — the app's only dialog. Never a centered modal.
 *
 * The web positions the sheet absolutely inside the phone frame; in RN it has
 * to be a real `Modal`, or it would sit under the tab bar and the status bar.
 */
export function Sheet({ open = true, title, onClose, children, style, labels, testID }: SheetProps) {
  const { colors, space, shadows } = useTheme();
  const { dur, easing } = useMotion();
  const { height: windowHeight } = useWindowDimensions();
  const { t } = useTranslation();

  // useSafeAreaInsets() throws without a provider; the sheet is a leaf that
  // screens and tests drop in anywhere, so read the context and fall back.
  const insets = useContext(SafeAreaInsetsContext) ?? NO_INSETS;

  // Kept mounted for the duration of the exit animation.
  const [mounted, setMounted] = useState(open);

  const progress = useSharedValue(0);
  // Seeded with the window height so the panel is off-screen for the frame
  // between mount and first layout; onLayout then swaps in its real height,
  // while progress is still ~0 and the panel is off-screen either way.
  const panelHeight = useSharedValue(windowHeight);

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  useEffect(() => {
    if (open) {
      progress.value = withTiming(1, { duration: dur.slow, easing: easing.out });
    }
  }, [open, dur.slow, easing.out, progress]);

  useEffect(() => {
    if (open) return;
    progress.value = withTiming(0, { duration: dur.base, easing: easing.out }, (finished) => {
      if (finished) runOnJS(setMounted)(false);
    });
  }, [open, dur.base, easing.out, progress]);

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      panelHeight.value = e.nativeEvent.layout.height;
    },
    [panelHeight]
  );

  // @keyframes b-fade
  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  // @keyframes b-up — from { transform: translateY(100%) }
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: panelHeight.value * (1 - progress.value) }],
  }));

  if (!mounted) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
      testID={testID}
    >
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, scrimStyle]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={labels?.close ?? t('common.close')}
            testID={testID ? `${testID}-scrim` : 'sheet-scrim'}
            onPress={onClose}
            style={[StyleSheet.absoluteFill, styles.scrim]}
          />
        </Animated.View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.kav}
        >
          <Animated.View
            accessibilityViewIsModal
            accessibilityLabel={title}
            onLayout={onLayout}
            style={[
              styles.panel,
              {
                backgroundColor: colors.surface,
                boxShadow: shadows.sheet,
                paddingHorizontal: space.screenX,
                paddingBottom: space.screenX + 8 + insets.bottom,
                maxHeight: windowHeight * 0.92,
              },
              panelStyle,
              style,
            ]}
          >
            <View style={styles.grab} />

            {title || onClose ? (
              <View style={styles.head}>
                <Text variant="displaySm" upper numberOfLines={1} style={styles.title}>
                  {title ?? ''}
                </Text>
                {onClose ? (
                  <IconButton
                    icon="X"
                    size="sm"
                    label={labels?.close ?? t('common.close')}
                    onPress={onClose}
                    testID={testID ? `${testID}-close` : undefined}
                  />
                ) : null}
              </View>
            ) : null}

            {/* `nestedScrollEnabled` on the OUTER scroller too: Android only hands
                a gesture to an inner ScrollView when both sides opt in (the
                PersonPicker's 220px roster is the case that needs it). */}
            <ScrollView
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              style={styles.bodyScroll}
              contentContainerStyle={styles.body}
            >
              {children}
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: 'rgba(11, 11, 11, 0.45)' },
  kav: { flex: 1, justifyContent: 'flex-end', pointerEvents: 'box-none' },
  panel: {
    borderTopLeftRadius: 20, // --r-sheet
    borderTopRightRadius: 20,
    paddingTop: 8,
    flexDirection: 'column',
    flexShrink: 1,
  },
  grab: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: ink[200],
    alignSelf: 'center',
    marginTop: 4,
    marginBottom: 10,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 44,
    marginBottom: 8,
  },
  title: { flexShrink: 1 },
  bodyScroll: { flexGrow: 0, flexShrink: 1 },
  body: { flexDirection: 'column', gap: 12 },
});

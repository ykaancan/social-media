import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';

export interface ScreenProps {
  scrollRef?: React.Ref<ScrollView>;
  onContentSizeChange?: (width:number,height:number)=>void;
  children: React.ReactNode;
  /**
   * `S.header` — a `Back`, a `Wordmark` row, a title row. It sits OUTSIDE the
   * scroller, exactly like the prototype's `flex: none` header.
   */
  header?: React.ReactNode;
  /** Default true. `false` gives a plain View body for a screen that brings its own list. */
  scroll?: boolean;
  /** The thumb zone: a `BottomBar`, which positions itself over the body. */
  bottom?: React.ReactNode;
  /** Merged onto the body, for the rare screen that needs different insets. */
  contentStyle?: StyleProp<ViewStyle>;
  /** Lift the body above the keyboard. iOS only — Android's adjustResize already does it. */
  keyboard?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The screen scaffold every product screen composes: `S.frame` + `S.header` +
 * `S.body` + `S.bottom` from `prototypes/onboarding-app.jsx`.
 *
 * The prototype's frame chrome (390x844 rounded phone, the fake status bar and
 * the `#e8e8e8` page behind it) is scaffolding, not product — HANDOFF §0 — so
 * the frame becomes a plain `SafeAreaView` on `--bg` with the real top inset.
 *
 * `S.body` is `padding: 4px 16px 130px` with `gap: 16`. The 130px is what makes
 * the last card scroll clear of the `BottomBar`; keep it even on a screen with
 * no bar, so two screens in the same stack scroll to the same place.
 */
export function Screen({
  children,
  scrollRef,
  onContentSizeChange,
  header,
  scroll = true,
  bottom,
  contentStyle,
  keyboard = false,
  style,
  testID,
}: ScreenProps) {
  const { colors } = useTheme();

  // The gap lives on this View rather than on the ScrollView's content
  // container so the non-scrolling body is laid out identically.
  const body = <View style={[styles.body, contentStyle]}>{children}</View>;

  const content = scroll ? (
    <ScrollView
      ref={scrollRef}
      onContentSizeChange={onContentSizeChange}
      testID={testID ? `${testID}-scroll` : undefined}
      style={styles.fill}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      {body}
    </ScrollView>
  ) : (
    <View style={styles.fill}>{body}</View>
  );

  const inner = (
    <>
      {header ?? null}
      {content}
      {bottom ?? null}
    </>
  );

  return (
    <SafeAreaView
      testID={testID}
      edges={['top']}
      style={[styles.root, { backgroundColor: colors.bg }, style]}
    >
      {keyboard && Platform.OS === 'ios' ? (
        <KeyboardAvoidingView behavior="padding" style={styles.fill}>
          {inner}
        </KeyboardAvoidingView>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
  // `flexGrow` (not `flex`) so a short body can still centre an Empty state
  // while a long one keeps scrolling.
  scrollContent: { flexGrow: 1 },
  body: { flexGrow: 1, gap: 16, paddingTop: 4, paddingHorizontal: 16, paddingBottom: 130 },
});

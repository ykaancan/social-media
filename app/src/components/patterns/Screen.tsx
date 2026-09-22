import React, { createContext, useContext, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';

export const BottomInsetContext = createContext<(height: number) => void>(() => {});
export interface ScreenProps {
  onScroll?: ScrollViewProps['onScroll'];
  onViewportChange?: ScrollViewProps['onLayout'];
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
 * Shared screen scaffold with a fixed header and scrolling body.
 * BottomBar reports its actual height so the last row clears visible actions.
 */
export function Screen({
  children,
  scrollRef,
  onContentSizeChange,
  onScroll,
  onViewportChange,
  header,
  scroll = true,
  bottom,
  contentStyle,
  keyboard = false,
  style,
  testID,
}: ScreenProps) {
  const { colors } = useTheme();
  const [bottomHeight, setBottomHeight] = useState(0);
  const insets = useContext(SafeAreaInsetsContext);

  // The gap lives on this View rather than on the ScrollView's content
  // container so the non-scrolling body is laid out identically.
  const body = <View style={[styles.body, { paddingBottom: Math.max(bottomHeight, insets?.bottom ?? 0) + 16 }, contentStyle]}>{children}</View>;

  const content = scroll ? (
    <ScrollView
      ref={scrollRef}
      onScroll={onScroll}
      onLayout={onViewportChange}
      scrollEventThrottle={16}
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
      <BottomInsetContext.Provider value={setBottomHeight}>{bottom ?? null}</BottomInsetContext.Provider>
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
  body: { flexGrow: 1, gap: 16, paddingTop: 4, paddingHorizontal: 16, paddingBottom: 16 },
});

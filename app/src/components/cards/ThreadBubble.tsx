import React, { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { postIn, useMotion, useTheme } from '../../theme';
import { Text } from '../core/Text';
import {
  AnonymityBadge,
  type AnonymityHints,
  type AnonymityLevel,
} from '../anonymity/AnonymityBadge';

export interface ThreadBubbleSender {
  /**
   * [D5] The level this ONE message was sent at. It is stored on the message
   * row and never rewritten.
   */
  level: AnonymityLevel;
  name?: string;
  avatar?: string;
  hints?: AnonymityHints;
}

export interface ThreadBubbleProps {
  text: string;
  mine?: boolean;
  system?: boolean;
  time?: string;
  sender?: ThreadBubbleSender;
  labels?: { anonymous?: string; hint?: string };
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * One bubble in a private thread.
 *
 * **[D5]** The badge is rendered from THIS message's `sender` prop — the level
 * the message was *sent at*. The component never reads the thread
 * participant's current level, so a later "Reveal myself" adds a system line
 * and changes only the bubbles sent after it; everything already on screen
 * stays masked. Callers must pass the level stored on the message row.
 */
export function ThreadBubble({
  text,
  mine = false,
  system = false,
  time,
  sender,
  labels,
  style,
  testID,
}: ThreadBubbleProps) {
  const { colors } = useTheme();
  const { dur, easing } = useMotion();

  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(1, { duration: dur.base, easing: easing.out });
  }, [progress, dur.base, easing]);

  const entering = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [postIn.from.opacity, postIn.to.opacity]),
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [postIn.from.translateY, postIn.to.translateY]) },
      { scale: interpolate(progress.value, [0, 1], [postIn.from.scale, postIn.to.scale]) },
    ],
  }));

  if (system) {
    return (
      <Animated.View testID={testID} style={[styles.root, styles.system, entering, style]}>
        <Text variant="bodySm" color={colors.text2} style={[styles.systemBubble, styles.centred]}>
          {text}
        </Text>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      testID={testID}
      style={[styles.root, mine ? styles.mine : null, entering, style]}
    >
      {sender && !mine ? (
        <View style={styles.sender}>
          <AnonymityBadge
            level={sender.level}
            name={sender.name}
            avatar={sender.avatar}
            hints={sender.hints}
            labels={labels}
            size="sm"
          />
        </View>
      ) : null}
      <Text
        variant="body"
        color={mine ? colors.onPrimary : colors.text}
        style={[
          styles.bubble,
          mine
            ? { backgroundColor: colors.primary, borderBottomRightRadius: 6 }
            : { backgroundColor: colors.surfaceMuted, borderBottomLeftRadius: 6 },
        ]}
      >
        {text}
      </Text>
      {time ? (
        <Text variant="caption" color={colors.text3} nums style={styles.time}>
          {time}
        </Text>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // No alignSelf on the "theirs" side: the web `.c-tb` has none either, so it
  // stretches to the 82% cap inside the thread's flex column.
  root: { flexDirection: 'column', gap: 4, maxWidth: '82%' },
  mine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  sender: { marginBottom: 2 },
  bubble: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18 },
  time: { paddingHorizontal: 4 },
  system: { alignSelf: 'center', maxWidth: '90%' },
  systemBubble: { backgroundColor: 'transparent', paddingVertical: 4, paddingHorizontal: 8 },
  centred: { textAlign: 'center' },
});

import React, { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { projectorIn, tracking, useEventColor, useMotion, useTheme } from '../../theme';
import { Text } from '../core/Text';
import {
  AnonymityBadge,
  type AnonymityHints,
  type AnonymityLevel,
} from '../anonymity/AnonymityBadge';

export interface ProjectorSender {
  level: AnonymityLevel;
  name?: string;
  avatar?: string;
  hints?: AnonymityHints;
}

export interface ProjectorPostProps {
  text: string;
  sender?: ProjectorSender;
  time?: string;
  /** emoji -> count; only positive counts show, top three by count. */
  reactions?: Record<string, number>;
  labels?: { anonymous?: string; hint?: string };
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Below this length the post gets the bigger 96px face. */
const SHORT_MAX = 60;
const MAX_REACTIONS = 3;

/**
 * One board post at 1920x1080, read from 15 metres.
 *
 * Render it inside `<ThemeProvider scheme="projector">` — the component does
 * not wrap itself, so a screen can put several on one dark canvas. The event
 * colour (the only accent) comes from the ambient EventColorProvider.
 */
export function ProjectorPost({
  text,
  sender = { level: 'anonymous' },
  time,
  reactions = {},
  labels,
  style,
  testID,
}: ProjectorPostProps) {
  const { colors, text: type } = useTheme();
  const event = useEventColor();
  const { dur, easing } = useMotion();

  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(1, { duration: dur.projectorIn, easing: easing.out });
  }, [progress, dur.projectorIn, easing]);

  const entering = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [projectorIn.from.opacity, projectorIn.to.opacity]),
    transform: [
      {
        translateY: interpolate(
          progress.value,
          [0, 1],
          [projectorIn.from.translateY, projectorIn.to.translateY]
        ),
      },
    ],
  }));

  const short = text.length <= SHORT_MAX;

  const shown = Object.entries(reactions)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_REACTIONS);

  return (
    <Animated.View testID={testID} style={[styles.root, entering, style]}>
      <View style={[styles.bar, { backgroundColor: event.cover }]} />
      <View style={styles.inner}>
        <View style={styles.header}>
          {/* xl, per ProjectorPost.jsx — HANDOFF §7 records the prompt's "lg". */}
          <AnonymityBadge
            level={sender.level}
            name={sender.name}
            avatar={sender.avatar}
            hints={sender.hints}
            labels={labels}
            size="xl"
          />
          {time ? (
            <Text
              variant="projectorMeta"
              color={colors.text3}
              nums
              upper
              numberOfLines={1}
              style={{ letterSpacing: tracking(0.02, type.projectorMeta.fontSize ?? 40) }}
            >
              {time}
            </Text>
          ) : null}
        </View>

        <Text
          testID="projector-post-body"
          variant={short ? 'projectorPostShort' : 'projectorPost'}
          color={colors.text}
        >
          {text}
        </Text>

        {shown.length ? (
          <View style={styles.footer}>
            {shown.map(([emoji, n]) => (
              <View key={emoji} style={styles.reaction}>
                <Text variant="body" style={styles.emoji}>
                  {emoji}
                </Text>
                <Text variant="projectorMeta" color={colors.text2} nums>
                  {n}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', columnGap: 40, paddingVertical: 8 },
  bar: { width: 12, borderRadius: 6, alignSelf: 'stretch' },
  inner: { flex: 1, flexDirection: 'column', gap: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', columnGap: 32 },
  footer: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 20, columnGap: 20 },
  reaction: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emoji: { fontSize: 48, lineHeight: 48 },
});

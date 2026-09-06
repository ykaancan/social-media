import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { ink, useTheme } from '../../theme';
import { Icon } from '../core/Icon';
import { PulseDot } from '../core/StatusPill';
import { Text } from '../core/Text';

export interface PendingStep {
  label: string;
  description?: string;
  done?: boolean;
  current?: boolean;
}

export interface PendingStateProps {
  title: string;
  subtitle?: string;
  steps?: PendingStep[];
  note?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const DOT = 28;

/**
 * The "pending approval" body: display title, numbered steps, a note.
 * `pending` means the account cannot use the app yet — the copy must not
 * promise anything the admin has not done.
 */
export function PendingState({ title, subtitle, steps = [], note, style, testID }: PendingStateProps) {
  const { colors, radius } = useTheme();

  return (
    <View testID={testID} style={[styles.root, style]}>
      <View>
        <Text variant="displayLg" upper>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="body" color={colors.text2}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      <View>
        {steps.map((step, i) => {
          const last = i === steps.length - 1;
          const dotStyle: ViewStyle = step.done
            ? { backgroundColor: colors.text, borderColor: colors.text }
            : step.current
              ? { backgroundColor: colors.bg, borderColor: colors.text }
              : { backgroundColor: colors.surfaceMuted, borderColor: colors.border };
          const numberColor = step.current ? colors.text : colors.text3;

          return (
            <View key={i} style={styles.step}>
              {last ? null : (
                <View
                  // .c-pend__step::before — the connector runs from the bottom
                  // of the dot to the bottom of the row (padding included).
                  style={[
                    styles.connector,
                    { backgroundColor: step.done ? colors.text : colors.border },
                  ]}
                />
              )}
              <View style={styles.dotSlot}>
                {step.current ? (
                  // The CSS reassigns --live to ink-900 inside this rule, so the
                  // ring is ink, not the live green.
                  <PulseDot
                    size={DOT}
                    color={ink[900]}
                    testID={`pending-step-${i}-pulse`}
                    style={styles.pulse}
                  />
                ) : null}
                <View testID={`pending-step-${i}-dot`} style={[styles.dot, dotStyle]}>
                  {step.done ? (
                    <Icon name="Check" size={14} strokeWidth={3} color={colors.bg} />
                  ) : (
                    <Text variant="captionCaps" color={numberColor} nums>
                      {i + 1}
                    </Text>
                  )}
                </View>
              </View>
              <View style={styles.stepBody}>
                <Text variant="bodyStrong" style={styles.label}>
                  {step.label}
                </Text>
                {step.description ? (
                  <Text variant="bodySm" color={colors.text2} style={styles.description}>
                    {step.description}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>

      {note ? (
        <View style={[styles.note, { borderRadius: radius.md, backgroundColor: colors.surfaceMuted }]}>
          <Icon name="Info" size={18} strokeWidth={2.25} color={colors.text2} />
          <Text variant="bodySm" color={colors.text2} style={styles.noteText}>
            {note}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'column', gap: 20, paddingVertical: 8 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingBottom: 18 },
  connector: { position: 'absolute', left: 13, top: DOT, bottom: 0, width: 2 },
  dotSlot: { width: DOT, height: DOT, alignItems: 'center', justifyContent: 'center' },
  pulse: { position: 'absolute' },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBody: { flex: 1 },
  label: { paddingTop: 3 },
  description: { marginTop: 2 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12, paddingHorizontal: 14 },
  noteText: { flex: 1 },
});

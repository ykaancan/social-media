import React from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { bodyFamily, useTheme, withAlpha } from '../../theme';
import { Icon, type IconName } from '../core/Icon';
import { Text } from '../core/Text';
import { upper } from '../../utils/text';

export type HintKind = 'section' | 'country' | 'letter';
export type HintChipSize = 'sm' | 'md' | 'lg' | 'xl';

export interface HintChipProps {
  kind?: HintKind;
  value?: string;
  size?: HintChipSize;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** .a-hint / --sm / --lg / --xl */
const SIZES = {
  sm: { height: 22, paddingLeft: 6, paddingRight: 8, gap: 5, fontSize: 12, borderWidth: 1.5, icon: 12 },
  md: { height: 26, paddingLeft: 7, paddingRight: 9, gap: 5, fontSize: 13, borderWidth: 1.5, icon: 14 },
  lg: { height: 44, paddingLeft: 12, paddingRight: 16, gap: 8, fontSize: 24, borderWidth: 2, icon: 22 },
  xl: { height: 60, paddingLeft: 16, paddingRight: 22, gap: 12, fontSize: 32, borderWidth: 2.5, icon: 30 },
} as const;

const ICON: Record<HintKind, IconName> = { section: 'MapPin', country: 'Flag', letter: 'CaseUpper' };

/**
 * One clue about the sender. **A dashed border = clue, never identity** — the
 * dashes are the whole point of the component; do not swap them for a solid
 * outline to "tidy" a screen.
 */
export function HintChip({ kind = 'section', value, size = 'md', style, testID }: HintChipProps) {
  const { colors, radius } = useTheme();
  const s = SIZES[size];

  const base: TextStyle = {
    fontFamily: bodyFamily(600), // --body-sm-strong family, size overridden per chip
    fontSize: s.fontSize,
    lineHeight: Math.round(s.fontSize * 1.4),
  };

  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={kind === 'letter' ? undefined : value}
      style={[
        styles.root,
        {
          height: s.height,
          paddingLeft: s.paddingLeft,
          paddingRight: s.paddingRight,
          gap: s.gap,
          borderRadius: radius.pill,
          backgroundColor: colors.anonHintBg,
          borderWidth: s.borderWidth,
          // The dashed stroke IS the meaning ("clue, never identity"); it was
          // missing from the first port and rendered solid on every platform.
          borderStyle: 'dashed',
          // color-mix(in oklch, var(--anon-hint) 45%, transparent)
          borderColor: withAlpha(colors.anonHint, 0.45),
        },
        style,
      ]}
    >
      <Icon name={ICON[kind]} size={s.icon} strokeWidth={2.25} color={colors.anonHint} />
      {kind === 'letter' ? (
        <Text variant="bodySmStrong" color={colors.anonHint} numberOfLines={1} style={base}>
          <Text
            testID={testID ? `${testID}-letter` : 'hint-chip-letter'}
            variant="bodySmStrong"
            color={colors.anonHint}
            style={{
              // the CSS asks for font-weight 800 and the ExtraBold face is
              // bundled for it — never a `fontWeight`, which would make Android
              // synthesise a fake bold on top of an already-bold TTF.
              fontFamily: bodyFamily(800),
              fontSize: Math.round(s.fontSize * 1.15),
            }}
          >
            {upper(String(value || '?').charAt(0), 'tr')}
          </Text>
          {'···'}
        </Text>
      ) : (
        <Text variant="bodySmStrong" color={colors.anonHint} numberOfLines={1} style={base}>
          {value}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
});

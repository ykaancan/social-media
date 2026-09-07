import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from '../../i18n';
import { covers, ink, useTheme, type TypographyVariant } from '../../theme';
import { Text } from '../core/Text';

/** HANDOFF §1.10: the three treatments the bundle actually shows. */
export type WordmarkTreatment = 'plain' | 'inverse' | 'lime';
export type WordmarkSize = 'xl' | 'md' | 'sm';

export interface WordmarkProps {
  /** Defaults to `plain`. */
  treatment?: WordmarkTreatment;
  /** Defaults to `xl` for `plain` (the splash) and `md` for the two blocks. */
  size?: WordmarkSize;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const VARIANTS: Record<WordmarkSize, TypographyVariant> = {
  xl: 'displayXl',
  md: 'displayMd',
  sm: 'displaySm',
};

/**
 * HANDOFF §1.10: *"no logo exists. Wherever a mark would go, set `[BRAND]` in
 * display type, uppercase, `--display-tracking`."* Three treatments: plain at
 * `--display-xl` (the splash), `--display-md` white on `--ink-900`, and
 * `--display-md` ink on `--cover-lime`. The pending header is the plain mark at
 * `--display-sm`.
 *
 * The tracking is already inside every display token, and the uppercasing goes
 * through `Text upper` (Turkish-aware `upper()`, never `textTransform`).
 *
 * The two block treatments are fixed ink and fixed lime — they are the mark, not
 * an event surface, so they never read `--event` (§1.3: covers are for events).
 * The bundle names the 8px radius but not the block's padding; it is derived
 * from the 4px spacing scale.
 */
export function Wordmark({ treatment = 'plain', size, style, testID }: WordmarkProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const scale = size ?? (treatment === 'plain' ? 'xl' : 'md');
  const brand = t('_meta.brand');

  const skin =
    treatment === 'inverse'
      ? { background: ink[900], foreground: ink[0] }
      : treatment === 'lime'
        ? { background: covers.lime.cover, foreground: colors.onCover }
        : null;

  const mark = (
    <Text variant={VARIANTS[scale]} upper color={skin ? skin.foreground : colors.text}>
      {brand}
    </Text>
  );

  if (!skin) {
    return (
      <View testID={testID} style={style}>
        {mark}
      </View>
    );
  }

  return (
    <View testID={testID} style={[styles.block, { backgroundColor: skin.background }, style]}>
      {mark}
    </View>
  );
}

const styles = StyleSheet.create({
  // 8px radius per §1.10; `flex-start` so the block hugs the mark instead of
  // stretching across whatever column it is dropped into.
  block: { alignSelf: 'flex-start', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 },
});

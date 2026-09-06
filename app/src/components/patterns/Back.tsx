import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from '../../i18n';
import { IconButton } from '../core/IconButton';
import { Text } from '../core/Text';

export interface BackProps {
  onBack: () => void;
  /** Optional display title under the button row. */
  title?: string;
  /** Trailing controls on the button row (IconButton, Button, StatusPill …). */
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * `S.header` — the pushed-screen header. The onboarding prototype's `Back` is
 * this with no title and no `right`, and the settings prototype's `Screen`
 * header is this with a title, so there is one component for all three.
 *
 * The title is ALWAYS left-aligned (§1.6 of the bundle: this app never centres
 * a nav title), and uppercased through the Turkish-aware `upper` prop.
 */
export function Back({ onBack, title, right, style, testID }: BackProps) {
  const { t } = useTranslation();

  return (
    <View testID={testID} style={[styles.root, style]}>
      <View style={styles.row}>
        <IconButton icon="ArrowLeft" label={t('common.back')} onPress={onBack} />
        {right ?? null}
      </View>
      {title ? (
        <Text variant="displayLg" upper style={styles.title}>
          {title}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingTop: 6, paddingHorizontal: 16, paddingBottom: 12, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 44 },
  // `text-wrap: balance` has no RN equivalent; the tracking and 0.95 line
  // height already live in the displayLg token.
  title: { textAlign: 'left' },
});

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '../core/Button';
import { Wordmark } from './Wordmark';

export interface OnboardingHeaderProps {
  /** The one action on the right, e.g. "Log out". */
  actionLabel: string;
  onAction: () => void;
  /** Lands on the action button. */
  testID?: string;
}

/**
 * The onboarding header with no back arrow: the small plain mark and one ghost
 * action — `S.header` of `/design/bundle/prototypes/onboarding-app.jsx`
 * without a title. The screens that have nothing behind them use it (Confirm
 * email, first Profile setup, the restricted account screen).
 *
 * [D1] It was rebuilt inline on Pending and Profile setup; the third screen
 * that needed it (Confirm email, T-3) moved it into the library unchanged.
 */
export function OnboardingHeader({ actionLabel, onAction, testID }: OnboardingHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        <Wordmark treatment="plain" size="sm" />
        <Button variant="ghost" size="sm" onPress={onAction} testID={testID}>
          {actionLabel}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: 6, paddingHorizontal: 16, paddingBottom: 12 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 44,
  },
});

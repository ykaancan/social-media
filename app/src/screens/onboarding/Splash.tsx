import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Text } from '../../components/core';
import { BottomBar, CoverStrip, Screen, Wordmark } from '../../components/patterns';
import { useTranslation } from '../../i18n';
import { displayTrackingEm, tracking, useTheme } from '../../theme';
import type { RootScreenProps } from '../../navigation/types';

/**
 * `prototypes/onboarding-app.jsx`, `screen === "splash"`.
 *
 * No header, no scroller: a single column centred in the frame, `gap: 28`,
 * `padding: 0 24px 80px`, holding the wordmark, the headline block (its own
 * `gap: 10`) and the cover strip. The two buttons live in the thumb zone.
 *
 * The prototype sizes the headline with `{ ...S.title, fontSize: 40 }` — the
 * `--display-lg` token overridden to 40px. RN cannot inherit a token and change
 * one field, so the two dependent numbers are recomputed here from the same
 * formulas the token uses: `lineHeight = round(40 x 0.95)` and
 * `letterSpacing = tracking(--display-tracking, 40)`.
 */
export function Splash({ navigation }: RootScreenProps<'Splash'>) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <Screen
      testID="splash"
      scroll={false}
      contentStyle={styles.body}
      bottom={
        <BottomBar>
          <Button size="lg" full testID="splash-signup" onPress={() => navigation.navigate('SignUp')}>
            {t('onboarding.signUp')}
          </Button>
          <Button
            size="lg"
            full
            variant="ghost"
            testID="splash-login"
            onPress={() => navigation.navigate('LogIn')}
          >
            {t('onboarding.logIn')}
          </Button>
        </BottomBar>
      }
    >
      <Wordmark treatment="plain" size="xl" />

      <View style={styles.headline}>
        <Text variant="displayLg" upper style={styles.title}>
          {t('onboarding.splashTitle')}
        </Text>
        <Text variant="body" color={colors.text2} style={styles.sub}>
          {t('onboarding.splashSub')}
        </Text>
      </View>

      <CoverStrip size="md" testID="splash-covers" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  // S.body is replaced wholesale here: the splash column is centred, inset 24
  // and clears the thumb zone with 80 rather than the scroller's 130.
  body: {
    justifyContent: 'center',
    gap: 28,
    paddingTop: 0,
    paddingHorizontal: 24,
    paddingBottom: 80,
  },
  headline: { gap: 10 },
  title: { fontSize: 40, lineHeight: 38, letterSpacing: tracking(displayTrackingEm, 40) },
  sub: { fontSize: 17, lineHeight: 25 },
});

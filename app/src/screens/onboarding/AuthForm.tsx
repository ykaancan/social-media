import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { isApiError, LIMITS } from '../../api';
import { Button, Input, Text } from '../../components/core';
import { Back, BottomBar, CoverStrip, Screen, useToast } from '../../components/patterns';
import { useTranslation } from '../../i18n';
import { useSession } from '../../session';
import { useTheme } from '../../theme';

/**
 * `prototypes/onboarding-app.jsx`, `screen === "signup" || screen === "login"`.
 * One screen with two modes, exactly as the prototype builds it.
 *
 * Two deliberate departures from that branch, both recorded in the step report:
 *
 * - **No "Continue with Apple / Google" buttons and no "or the classic way"
 *   divider.** The prototype's pair only raise a placeholder toast. Shipping a
 *   button that cannot sign anyone in is fabricating a capability, which
 *   principle 4 forbids. They come back the day real providers do.
 * - The primary carries the arrow on the **right** (`iconRight`). The prototype
 *   passes `icon`, putting it before the label; the RN `Button` has both slots
 *   and "Continue >" is what the glyph means.
 *
 * Nothing here navigates on success. Routing is a function of the session
 * (`RootNavigator`): registering swaps the stack to the `incomplete` group and
 * logging in to whichever group the account's status names, so a `navigate`
 * call would only fight the swap.
 */

export type AuthMode = 'signUp' | 'logIn';

export interface AuthFormProps {
  mode: AuthMode;
  onBack: () => void;
  /** Swaps to the other mode. `replace`, not `push` — the two are one step. */
  onSwapMode: () => void;
}

export function AuthForm({ mode, onBack, onSwapMode }: AuthFormProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const toast = useToast();
  const { register, login, forgotPassword } = useSession();

  const isSignUp = mode === 'signUp';
  const id = isSignUp ? 'signup' : 'login';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  // A successful submit unmounts this screen with the stack swap under it, so
  // the request's tail must not touch state that is no longer mounted.
  const alive = useRef(true);
  useEffect(() => () => {
    alive.current = false;
  }, []);

  const address = email.trim();
  const emailOk = LIMITS.emailPattern.test(address);
  const passwordOk = password.length >= LIMITS.passwordMin;
  const canSubmit = emailOk && passwordOk && !busy;

  // A field error describes the value that was sent; changing the value makes
  // it stale, so it clears with the keystroke rather than with the next submit.
  const changeEmail = useCallback((value: string) => {
    setEmail(value);
    setEmailError(undefined);
  }, []);

  const changePassword = useCallback((value: string) => {
    setPassword(value);
    setPasswordError(undefined);
  }, []);

  const submit = useCallback(async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      if (isSignUp) {
        await register({ email: address, password, phone: phone.trim() || undefined });
      } else {
        await login({ email: address, password });
      }
    } catch (err) {
      // Each failure is shown where it can be acted on: on the field that is
      // wrong when the server names one, in a toast when nothing on this screen
      // is at fault.
      if (isApiError(err, 'email_in_use')) setEmailError(t('onboarding.errorEmailInUse'));
      else if (isApiError(err, 'invalid_credentials')) {
        setPasswordError(t('onboarding.errorCredentials'));
      } else if (isApiError(err, 'network')) {
        toast.show(t('onboarding.errorNetwork'), { tone: 'warn' });
      } else toast.show(t('onboarding.errorGeneric'), { tone: 'danger' });
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [address, canSubmit, isSignUp, login, password, phone, register, t, toast]);

  const forgot = useCallback(async () => {
    try {
      await forgotPassword(address);
    } catch (err) {
      // The server answers 202 whether or not the address exists, so success
      // and "no such account" are the same event and get the same words. A
      // network failure is NOT: nothing was sent, and saying it was would leave
      // someone waiting for an email that is never coming.
      if (isApiError(err, 'network')) {
        toast.show(t('onboarding.errorNetwork'), { tone: 'warn' });
        return;
      }
    }
    toast.show(t('onboarding.resetSent'));
  }, [address, forgotPassword, t, toast]);

  return (
    <Screen
      testID={id}
      keyboard
      header={<Back onBack={onBack} testID={`${id}-back`} />}
      bottom={
        <BottomBar>
          <Button
            size="md"
            full
            iconRight="ArrowRight"
            disabled={!emailOk || !passwordOk}
            loading={busy}
            onPress={submit}
            testID={`${id}-submit`}
          >
            {isSignUp ? t('onboarding.continue') : t('onboarding.logIn')}
          </Button>
          <Button size="md" full variant="ghost" onPress={onSwapMode} testID={`${id}-swap`}>
            {isSignUp ? t('onboarding.haveAccount') : t('onboarding.noAccount')}
          </Button>
        </BottomBar>
      }
    >
      <View style={styles.head}>
        <CoverStrip size="sm" centered testID={`${id}-covers`} />
        <Text variant="displayLg" upper style={styles.title}>
          {isSignUp ? t('onboarding.signUp') : t('onboarding.logIn')}
        </Text>
        <Text variant="body" color={colors.text2} style={styles.sub}>
          {isSignUp ? t('onboarding.signUpSub') : t('onboarding.logInSub')}
        </Text>
      </View>

      <Input
        testID={`${id}-email`}
        label={t('onboarding.email')}
        type="email"
        value={email}
        onChange={changeEmail}
        placeholder={t('onboarding.emailPlaceholder')}
        error={emailError}
        returnKeyType="next"
        inputStyle={styles.field}
      />

      <Input
        testID={`${id}-password`}
        label={t('onboarding.password')}
        type="password"
        value={password}
        onChange={changePassword}
        placeholder={
          isSignUp ? t('onboarding.passwordPlaceholderNew') : t('onboarding.passwordPlaceholder')
        }
        // Sign-up only, and only while the rule is being broken: the hint is
        // help, not a standing instruction.
        hint={isSignUp && password.length > 0 && !passwordOk ? t('onboarding.passwordHint') : undefined}
        error={passwordError}
        returnKeyType="go"
        onSubmitEditing={submit}
        inputStyle={styles.field}
      />

      {isSignUp ? (
        <Input
          testID="signup-phone"
          label={t('onboarding.phone')}
          type="tel"
          value={phone}
          onChange={setPhone}
          placeholder={t('onboarding.phonePlaceholder')}
          hint={t('onboarding.phoneHint')}
          inputStyle={styles.field}
        />
      ) : (
        <Button
          size="sm"
          variant="ghost"
          disabled={!emailOk}
          onPress={forgot}
          style={styles.forgot}
          testID="login-forgot"
        >
          {t('onboarding.forgotPassword')}
        </Button>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // The one place this app centres type: the prototype's sign-up header block
  // (`alignItems: center; gap: 10; text-align: center; padding-top: 8`), which
  // §1.6's "never centred titles" rule is about nav headers, not this.
  head: { alignItems: 'center', gap: 10, paddingTop: 8 },
  title: { textAlign: 'center' },
  sub: { textAlign: 'center' },
  // S.fieldIn — these fields are tighter than the 48px default control.
  field: { paddingVertical: 9, paddingHorizontal: 14, minHeight: 40 },
  forgot: { alignSelf: 'flex-start' },
});

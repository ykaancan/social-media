import React from 'react';
import { AuthForm } from './AuthForm';
import type { RootScreenProps } from '../../navigation/types';

/**
 * `prototypes/onboarding-app.jsx`, `screen === "login"` — the same `AuthForm`
 * the sign-up screen renders, in its other mode.
 */
export function LogIn({ navigation }: RootScreenProps<'LogIn'>) {
  return (
    <AuthForm
      mode="logIn"
      onBack={() => navigation.goBack()}
      onSwapMode={() => navigation.replace('SignUp')}
    />
  );
}

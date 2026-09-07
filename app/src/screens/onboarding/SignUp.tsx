import React from 'react';
import { AuthForm } from './AuthForm';
import type { RootScreenProps } from '../../navigation/types';

/**
 * `prototypes/onboarding-app.jsx`, `screen === "signup"`. The whole screen is
 * `AuthForm` — sign up and log in are one layout with two modes there, and one
 * component with two modes here.
 */
export function SignUp({ navigation }: RootScreenProps<'SignUp'>) {
  return (
    <AuthForm
      mode="signUp"
      onBack={() => navigation.goBack()}
      onSwapMode={() => navigation.replace('LogIn')}
    />
  );
}

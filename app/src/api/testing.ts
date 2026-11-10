import type { MockApi } from './mock';
import { organisations } from '../dev/fixtures';
import type { AuthResult } from './types';

/**
 * TEST HELPERS for `MockApi`, used by the Jest suites only — nothing in the app
 * imports this file. They walk the real onboarding of the mock: sign up, open
 * the confirmation link [D18], send the profile [D14].
 */

export const TEST_PASSWORD = 'password123';

/** The fixture organisation a section belongs to [D15]. */
export function organisationOf(sectionId: string): string {
  const organisation = organisations.find((o) => o.sectionIds.includes(sectionId));
  if (!organisation) throw new Error(`no fixture organisation has section ${sectionId}`);
  return organisation.id;
}

/**
 * An `active`, confirmed account with no membership at all, signed in. The
 * returned `me` is the one `submitProfile` answered with.
 */
export async function activeAccount(api: MockApi, email: string, name = email.split('@')[0]): Promise<AuthResult> {
  const { tokens } = await api.register({ email, password: TEST_PASSWORD });
  api.confirmEmail(email);
  const me = await api.submitProfile({ name });
  return { tokens, me };
}

/**
 * The same, plus an approved membership with `sectionId` in that section's
 * organisation (ESN Türkiye for the default, Ankara) — the state every account
 * had before T-3, when the section lived on the account. Signed in.
 */
export async function memberAccount(api: MockApi, email: string, sectionId = 'ankara', name = email.split('@')[0]): Promise<AuthResult> {
  const { tokens } = await activeAccount(api, email, name);
  api.addMember(organisationOf(sectionId), email, sectionId);
  return { tokens, me: await api.me() };
}

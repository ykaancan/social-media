import type { Me, SectionRef } from './types';

/**
 * Reading a section off `Me.memberships` [D15]. The account has no section of
 * its own any more; these are the two places the app needs one.
 */

/**
 * The signed-in user's section in one organisation: the section of their
 * `approved` membership there, or undefined (no membership, not approved, or an
 * organisation without sections). The same rule the server uses for the hint
 * snapshot (TENANT_PLAN.md §3 rule 4).
 */
export function sectionIn(me: Me | null | undefined, organisationId: string | undefined): SectionRef | undefined {
  if (!me || !organisationId) return undefined;
  const membership = me.memberships.find(m => m.organisation.id === organisationId && m.status === 'approved');
  return membership?.section;
}

/**
 * Q5 (TENANT_PLAN.md §5): on your own Profile tab the "section · country" line
 * shows only if you have exactly one membership with a section. Only `approved`
 * memberships count: a pending or rejected request's section is not yours yet.
 */
export function soleMembershipSection(me: Me | null | undefined): SectionRef | undefined {
  const withSection = me?.memberships.filter(m => m.status === 'approved' && m.section) ?? [];
  return withSection.length === 1 ? withSection[0].section : undefined;
}

/**
 * The whole component library in one import, so a screen can write
 * `import { Button, PostCard, Group } from '../components'` instead of reaching
 * into five group barrels.
 *
 * [D1] The library is the 22 design-system components plus the recurring
 * patterns the prototypes rebuild inline. Screens compose from here; they do
 * not invent local helpers. A new component belongs to one of the five groups
 * below — nothing is exported from this file directly.
 *
 * Export names are unique across the groups, so `import *` from here is
 * unambiguous; keep it that way when adding one.
 */
export * from './core';
export * from './anonymity';
export * from './cards';
export * from './projector';
export * from './patterns';

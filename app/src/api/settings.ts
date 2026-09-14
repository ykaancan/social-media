import type { Me, ProfileRequest } from './types';
import type { MessageSender, WallSnapshot } from './messages';

export interface NotificationPreferences { inbox:boolean; threads:boolean; boardMentions:boolean }
export interface AccountSettings {
  writingPolicy: WallSnapshot['writingPolicy'];
  mutedWords: string[];
  notifications: NotificationPreferences;
  sectionChangeAvailableAt: string | null;
}
/** Opaque block reference and the identity already allowed when blocking. Never a user ID. */
export interface BlockedEntry { id:string; sender:MessageSender }
export interface SettingsApi {
  /** GET /me/settings */
  getSettings():Promise<AccountSettings>;
  /** PATCH /me/settings. Atomic validation; affects future delivery only. */
  updateSettings(input:Partial<Pick<AccountSettings,'writingPolicy'|'mutedWords'|'notifications'>>):Promise<AccountSettings>;
  /** GET /me/blocks. Anonymous entries remain anonymous. */
  getBlocked():Promise<BlockedEntry[]>;
  /** DELETE /me/blocks/:opaqueId */
  unblock(id:string):Promise<void>;
  /** PATCH /me/profile. Approved users stay approved; section is not editable here. */
  editProfile(input:Omit<ProfileRequest,'sectionId'>):Promise<Me>;
  /** PUT /me/section {sectionId}. Audit and one change per 30 days, without reapproval. */
  changeSection(sectionId:string):Promise<Me>;
  /** GET /me/export. Account-owned data and privacy-filtered received content; no hidden sender IDs. */
  exportAccount():Promise<Record<string,unknown>>;
  /** DELETE /me. Real deletion, including authored content, sessions, avatar and personal audit references. */
  deleteAccount():Promise<void>;
}

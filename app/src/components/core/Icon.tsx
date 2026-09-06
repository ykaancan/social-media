import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import {
  VenetianMask,
  Sparkles,
  User,
  MapPin,
  Flag,
  CaseUpper,
  Lock,
  LockOpen,
  Radio,
  ListChecks,
  Projector,
  Reply,
  BadgeCheck,
  TriangleAlert,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Check,
  X,
  CircleX,
  Plus,
  Ellipsis,
  ChevronRight,
  ChevronDown,
  Share,
  Copy,
  QrCode,
  ScanLine,
  LogIn,
  LogOut,
  PenLine,
  Pencil,
  Camera,
  Send,
  Clock,
  CalendarDays,
  Users,
  Inbox,
  StickyNote,
  MessagesSquare,
  MessageSquare,
  MessageSquareLock,
  MessageSquareOff,
  Settings,
  Settings2,
  ShieldCheck,
  Shield,
  Zap,
  Square,
  Eye,
  EyeOff,
  Ban,
  Trash2,
  Tag,
  Pin,
  Bell,
  Languages,
  VolumeX,
  UserPen,
  UserPlus,
  FileText,
  ExternalLink,
  Info,
  Eraser,
  RotateCcw,
  BellRing,
  FastForward,
  Signal,
  Wifi,
  BatteryFull,
  Search,
  SmilePlus,
} from 'lucide-react-native';
import { useTheme } from '../../theme';

/**
 * The icon set the design bundle actually uses. Adding a screen that needs a
 * new glyph means adding it here first — the union is deliberately closed so a
 * typo is a type error and the gallery can enumerate every icon we ship.
 *
 * Verified against lucide-react-native: every name below is an export of the
 * installed version (see __tests__/Icon.test.tsx). No aliases were needed.
 */
export const ICONS = {
  VenetianMask,
  Sparkles,
  User,
  MapPin,
  Flag,
  CaseUpper,
  Lock,
  LockOpen,
  Radio,
  ListChecks,
  Projector,
  Reply,
  BadgeCheck,
  TriangleAlert,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Check,
  X,
  CircleX,
  Plus,
  Ellipsis,
  ChevronRight,
  ChevronDown,
  Share,
  Copy,
  QrCode,
  ScanLine,
  LogIn,
  LogOut,
  PenLine,
  Pencil,
  Camera,
  Send,
  Clock,
  CalendarDays,
  Users,
  Inbox,
  StickyNote,
  MessagesSquare,
  MessageSquare,
  MessageSquareLock,
  MessageSquareOff,
  Settings,
  Settings2,
  ShieldCheck,
  Shield,
  Zap,
  Square,
  Eye,
  EyeOff,
  Ban,
  Trash2,
  Tag,
  Pin,
  Bell,
  Languages,
  VolumeX,
  UserPen,
  UserPlus,
  FileText,
  ExternalLink,
  Info,
  Eraser,
  RotateCcw,
  BellRing,
  FastForward,
  Signal,
  Wifi,
  BatteryFull,
  Search,
  SmilePlus,
} as const;

export type IconName = keyof typeof ICONS;

/** Every icon name, in declaration order. Used by the dev gallery. */
export const ICON_NAMES = Object.keys(ICONS) as IconName[];

export interface IconProps {
  name: IconName;
  /** px; the web source's default is 20 */
  size?: number;
  strokeWidth?: number;
  /** defaults to the current theme's text colour */
  color?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Lucide glyph. Renders on a 24 viewBox with round caps and joins (lucide's
 * own defaults), so it matches the prototype's <svg> exactly.
 */
export function Icon({ name, size = 20, strokeWidth = 2, color, style }: IconProps) {
  const { colors } = useTheme();
  const Glyph = ICONS[name];
  return <Glyph size={size} strokeWidth={strokeWidth} color={color ?? colors.text} style={style} />;
}

import React from 'react';
import { View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useTranslation } from '../../i18n';
import { bodyFamily, captionCapsTrackingEm, tracking, useTheme } from '../../theme';
import { Avatar, type AvatarSize } from '../core/Avatar';
import { Icon } from '../core/Icon';
import { Text } from '../core/Text';
import { HintChip } from './HintChip';

export type AnonymityLevel = 'anonymous' | 'hint' | 'named';
export type AnonymityBadgeSize = 'sm' | 'md' | 'lg' | 'xl';

export interface AnonymityHints {
  section?: string;
  country?: string;
  /** A name to take the first letter from; rendered "Ş···". */
  letter?: string;
}

export interface AnonymityBadgeProps {
  level?: AnonymityLevel;
  name?: string;
  avatar?: string;
  hints?: AnonymityHints;
  labels?: { anonymous?: string; hint?: string };
  size?: AnonymityBadgeSize;
  showLevel?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** .a-badge__mask / __hintico — 22 / 28 / 44 / 60 */
const CIRCLE: Record<AnonymityBadgeSize, number> = { sm: 22, md: 28, lg: 44, xl: 60 };
/** icon inside the circle */
const GLYPH: Record<AnonymityBadgeSize, number> = { sm: 13, md: 16, lg: 22, xl: 30 };
const AVATAR: Record<AnonymityBadgeSize, AvatarSize> = { sm: 'xs', md: 'sm', lg: 'lg', xl: 60 };

/**
 * The sender identity block. It goes on every card, bubble and projector post —
 * never render a sender without it, and never let the level be ambiguous:
 * anonymous = solid ink mask, hint = dashed clue chips, named = avatar + name.
 */
export function AnonymityBadge({
  level = 'anonymous',
  name,
  avatar,
  hints = {},
  labels = {},
  size = 'md',
  showLevel = true,
  style,
  testID,
}: AnonymityBadgeProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const L = {
    anonymous: labels.anonymous ?? (t('anon.anonymous') as string),
    hint: labels.hint ?? (t('anon.hint') as string),
  };

  const circle = CIRCLE[size];
  const glyph = GLYPH[size];
  const gap = size === 'xl' ? 16 : 8;

  /** .a-badge__lvl (+ --lg / --xl overrides) */
  const levelStyle: TextStyle | null =
    size === 'lg'
      ? { fontSize: 16, letterSpacing: tracking(captionCapsTrackingEm, 16) }
      : size === 'xl'
        ? { fontSize: 26, letterSpacing: tracking(0.1, 26) }
        : null;

  /** .a-badge__name (+ --lg / --xl overrides) */
  const nameStyle: TextStyle | null =
    size === 'lg'
      ? { fontSize: 24, lineHeight: Math.round(24 * 1.4) }
      : size === 'xl'
        ? { fontFamily: bodyFamily(700), fontSize: 36, lineHeight: Math.round(36 * 1.4) }
        : null;

  const root: ViewStyle = { flexDirection: 'row', alignItems: 'center', columnGap: gap, flexShrink: 1 };

  if (level === 'named') {
    return (
      <View
        testID={testID}
        accessible
        accessibilityLabel={name}
        style={[root, style]}
      >
        <Avatar name={name} src={avatar} size={AVATAR[size]} />
        <Text variant="bodySmStrong" color={colors.text} numberOfLines={1} style={[nameStyle, { flexShrink: 1 }]}>
          {name}
        </Text>
      </View>
    );
  }

  if (level === 'hint') {
    const chips: React.ReactNode[] = [];
    if (hints.section) chips.push(<HintChip key="s" kind="section" value={hints.section} size={size} />);
    if (hints.country) chips.push(<HintChip key="c" kind="country" value={hints.country} size={size} />);
    if (hints.letter) chips.push(<HintChip key="l" kind="letter" value={hints.letter} size={size} />);

    const spoken = [hints.section, hints.country, hints.letter].filter(Boolean).join(', ');

    return (
      <View
        testID={testID}
        accessible
        accessibilityLabel={spoken ? `${L.hint}: ${spoken}` : L.hint}
        style={[root, { flexWrap: 'wrap', rowGap: 6 }, style]}
      >
        <View
          style={{
            width: circle,
            height: circle,
            borderRadius: circle / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.anonHintBg,
          }}
        >
          <Icon name="Sparkles" size={glyph} strokeWidth={2.25} color={colors.anonHint} />
        </View>
        {chips.length ? (
          chips
        ) : showLevel ? (
          <Text variant="captionCaps" color={colors.text2} upper numberOfLines={1} style={levelStyle}>
            {L.hint}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View testID={testID} accessible accessibilityLabel={L.anonymous} style={[root, style]}>
      <View
        style={{
          width: circle,
          height: circle,
          borderRadius: circle / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.anonAnonymous,
        }}
      >
        <Icon name="VenetianMask" size={glyph} strokeWidth={2.25} color={colors.onPrimary} />
      </View>
      {showLevel ? (
        <Text variant="captionCaps" color={colors.text2} upper numberOfLines={1} style={levelStyle}>
          {L.anonymous}
        </Text>
      ) : null}
    </View>
  );
}

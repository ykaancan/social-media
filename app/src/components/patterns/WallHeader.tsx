import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../theme';
import { Avatar } from '../core/Avatar';
import { Chip } from '../core/Chip';
import { Icon } from '../core/Icon';
import { Text } from '../core/Text';

export interface WallUser {
  name: string;
  /**
   * [D11] Country is NOT an independent field: it is read through the user's
   * section. Both land on the one chip, `section · country`, and nothing in
   * the app ever lets someone pick a country on its own.
   */
  section?: string;
  country?: string;
  bio?: string;
  /** Photo URI. */
  avatar?: string;
  /** Sign-up preview: a photo was chosen but is not uploadable in stage 1. */
  hasPhoto?: boolean;
}

export interface WallHeaderProps {
  user: WallUser;
  /** Real count of approved messages. Never fabricated (principle 4). */
  count?: number;
  onSection?: () => void;
  /** Tighter block for a pushed profile screen. */
  compact?: boolean;
  /** The onboarding sign-up preview: bordered card, placeholders, no count. */
  preview?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** avatar, name, section chip, bio, "{n} on the wall". */
export function WallHeader({
  user,
  count,
  onSection,
  compact = false,
  preview = false,
  style,
  testID,
}: WallHeaderProps) {
  const { colors, radius, borderWidth } = useTheme();
  const { t } = useTranslation();

  const hasIdentity = Boolean(user.hasPhoto || user.name);
  const nameVariant = preview || compact ? 'displayMd' : 'displayLg';

  const chip =
    user.section != null ? (
      <Chip size="sm" icon="MapPin" tone="outline" onPress={onSection}>
        {user.country ? `${user.section} · ${user.country}` : user.section}
      </Chip>
    ) : preview ? (
      <Text variant="caption" color={colors.text3}>
        {t('onboarding.previewSection')}
      </Text>
    ) : null;

  return (
    <View
      testID={testID}
      style={[
        styles.root,
        preview
          ? {
              padding: 16,
              backgroundColor: colors.surface,
              borderWidth: borderWidth.base,
              borderColor: colors.border,
              borderRadius: radius.card,
            }
          : compact
            ? styles.compactPad
            : styles.fullPad,
        style,
      ]}
    >
      <View style={styles.top}>
        {preview && !hasIdentity ? (
          <View style={[styles.placeholderAvatar, { backgroundColor: colors.surfaceMuted }]}>
            <Icon name="User" size={26} color={colors.text3} />
          </View>
        ) : (
          <Avatar name={user.name || '?'} src={user.avatar} size={compact ? 'lg' : 'xl'} />
        )}
        <View style={styles.names}>
          <Text variant={nameVariant} upper color={user.name ? colors.text : colors.text3}>
            {user.name || t('onboarding.previewName')}
          </Text>
          {chip}
        </View>
      </View>

      {preview ? (
        <Text variant="body" color={user.bio ? colors.text : colors.text3}>
          {user.bio || t('onboarding.previewBio')}
        </Text>
      ) : user.bio ? (
        <Text variant="body">{user.bio}</Text>
      ) : null}

      {!preview && count !== undefined ? (
        <View style={styles.count}>
          <Icon name="MessageSquare" size={14} strokeWidth={2.25} color={colors.text2} />
          <Text variant="bodySmStrong" color={colors.text2}>
            {t('wall.onWallCount', { n: count })}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12 },
  fullPad: { paddingTop: 4, paddingBottom: 8 },
  compactPad: { paddingVertical: 12 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  names: { flex: 1, minWidth: 0, gap: 6, alignItems: 'flex-start' },
  // the preview's own 60px circle, not an Avatar size — it has no name to tint
  placeholderAvatar: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  count: { flexDirection: 'row', alignItems: 'center', gap: 5 },
});

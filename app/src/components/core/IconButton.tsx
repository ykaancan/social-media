import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Figtree_700Bold, useEventColor, useMotion, useTheme } from '../../theme';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type IconButtonVariant = 'ghost' | 'filled' | 'outline' | 'event';
export type IconButtonSize = 'sm' | 'md' | 'lg';

/** .b-ib--sm/md/lg box sizes, and the icon size the web picks per size. */
const SIZES: Record<IconButtonSize, { box: number; icon: number; strokeWidth: number }> = {
  sm: { box: 36, icon: 18, strokeWidth: 2.25 },
  md: { box: 44, icon: 22, strokeWidth: 2 },
  lg: { box: 56, icon: 26, strokeWidth: 2 },
};

export interface IconButtonProps {
  icon: IconName;
  /** Required: the web sets it as both `aria-label` and `title`. */
  label: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  /** Rendered only when truthy, capped at "99+" like the web. */
  badge?: number;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Round icon-only button (`.b-ib`). `lg` is the FAB and carries --shadow-fab.
 *
 * The `:hover` background rules are dropped (no hover on mobile) and
 * `:focus-visible`'s ring goes with them; `:active{transform:scale(.92)}`
 * becomes the press animation — note 0.92, not the Button's --press-scale.
 */
export function IconButton({
  icon,
  label,
  variant = 'ghost',
  size = 'md',
  badge,
  onPress,
  disabled = false,
  style,
  testID,
}: IconButtonProps) {
  const { colors, radius, shadows } = useTheme();
  const event = useEventColor();
  const { dur, easing, reduced } = useMotion();

  const sizing = SIZES[size];

  const skin: { background: string; foreground: string; borderWidth?: number; borderColor?: string } =
    variant === 'filled'
      ? { background: colors.primary, foreground: colors.onPrimary }
      : variant === 'outline'
        ? {
            // the CSS uses `inset 0 0 0 1.5px` — an RN border is inside the box
            // too, so the 36/44/56 outer size is unchanged.
            background: colors.surface,
            foreground: colors.text,
            borderWidth: 1.5,
            borderColor: colors.borderStrong,
          }
        : variant === 'event'
          ? { background: event.cover, foreground: event.onCover }
          : { background: 'transparent', foreground: colors.text };

  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const pressed = reduced ? 1 : 0.92;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => {
        scale.value = withTiming(pressed, { duration: dur.fast, easing: easing.out });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: dur.fast, easing: easing.out });
      }}
      style={styles.hit}
    >
      <Animated.View
        style={[
          styles.root,
          {
            width: sizing.box,
            height: sizing.box,
            borderRadius: radius.pill,
            backgroundColor: skin.background,
            opacity: disabled ? 0.4 : 1,
          },
          skin.borderWidth ? { borderWidth: skin.borderWidth, borderColor: skin.borderColor } : null,
          size === 'lg' ? { boxShadow: shadows.fab } : null,
          animated,
          style,
        ]}
      >
        <Icon name={icon} size={sizing.icon} strokeWidth={sizing.strokeWidth} color={skin.foreground} />
        {badge ? (
          <View
            style={[
              styles.badge,
              {
                // The web ring is an *outer* 2px box-shadow around an 18px
                // badge; RN borders are inside the box, so the badge is 22px
                // with a 2px border (18px of ink) and sits 2px further out.
                backgroundColor: colors.danger,
                borderColor: colors.bg,
              },
            ]}
          >
            <Text nums numberOfLines={1} color="#fff" style={styles.badgeText}>
              {badge > 99 ? '99+' : String(badge)}
            </Text>
          </View>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: { alignSelf: 'flex-start' },
  root: { alignItems: 'center', justifyContent: 'center', flexGrow: 0, flexShrink: 0 },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 5,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: Figtree_700Bold, fontSize: 11, lineHeight: 18, textAlign: 'center' },
});

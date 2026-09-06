import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTranslation } from '../../i18n';
import { postIn, useMotion, useTheme } from '../../theme';
import { Chip } from '../core/Chip';
import { Icon, type IconName } from '../core/Icon';
import { Text } from '../core/Text';
import { AnonymityBadge, type AnonymityLevel } from './AnonymityBadge';

export interface HintFields {
  section?: boolean;
  country?: boolean;
  letter?: boolean;
}

export interface AnonymitySelectorMe {
  name?: string;
  avatar?: string;
  section?: string;
  /** [D11] read through the user's section — never a free-typed nationality. */
  country?: string;
}

export type AnonymitySelectorLabelKey =
  | 'anonymous'
  | 'anonymousSub'
  | 'hint'
  | 'hintSub'
  | 'named'
  | 'namedSub'
  | 'showThem'
  | 'section'
  | 'country'
  | 'letter'
  | 'preview';

export interface AnonymitySelectorProps {
  value?: AnonymityLevel;
  onChange?: (level: AnonymityLevel) => void;
  hintFields?: HintFields;
  onHintFieldsChange?: (fields: HintFields) => void;
  me?: AnonymitySelectorMe;
  labels?: Partial<Record<AnonymitySelectorLabelKey, string>>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** .a-sel__hints — animates in with @keyframes post-in when hint is picked. */
function HintsBox({ children }: { children: React.ReactNode }) {
  const { colors, radius } = useTheme();
  const { dur, easing } = useMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, { duration: dur.base, easing: easing.out });
  }, [progress, dur.base, easing]);

  const animated = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [postIn.from.opacity, postIn.to.opacity]),
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [postIn.from.translateY, postIn.to.translateY]) },
      { scale: interpolate(progress.value, [0, 1], [postIn.from.scale, postIn.to.scale]) },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.hints,
        { borderRadius: radius.md, backgroundColor: colors.anonHintBg },
        animated,
      ]}
    >
      {children}
    </Animated.View>
  );
}

interface OptionProps {
  id: AnonymityLevel;
  icon: IconName;
  label: string;
  sub: string;
  checked: boolean;
  onPress: () => void;
}

function Option({ id, icon, label, sub, checked, onPress }: OptionProps) {
  const { colors, radius } = useTheme();
  const { dur, easing, pressScale } = useMotion();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const circle =
    id === 'anonymous'
      ? { backgroundColor: colors.anonAnonymous, color: colors.onPrimary }
      : id === 'hint'
        ? { backgroundColor: colors.anonHintBg, color: colors.anonHint }
        : { backgroundColor: colors.liveSoft, color: colors.text };

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      testID={`anonymity-option-${id}`}
      onPress={onPress}
      onPressIn={() => {
        scale.value = withTiming(pressScale, { duration: dur.fast, easing: easing.out });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: dur.fast, easing: easing.out });
      }}
      style={styles.optionPress}
    >
      <Animated.View
        style={[
          styles.option,
          {
            borderRadius: radius.lg,
            // checked swaps 1.5px -> 2px and trims a px of padding, so the box
            // does not grow
            borderWidth: checked ? 2 : 1.5,
            borderColor: checked ? colors.text : colors.borderStrong,
            backgroundColor: checked ? colors.surfaceMuted : colors.surface,
            paddingTop: checked ? 11 : 12,
            paddingHorizontal: checked ? 9 : 10,
            paddingBottom: checked ? 9 : 10,
          },
          animated,
        ]}
      >
        <View style={[styles.optionIcon, { backgroundColor: circle.backgroundColor }]}>
          <Icon name={icon} size={20} strokeWidth={2.25} color={circle.color} />
        </View>
        <Text variant="bodySmStrong" numberOfLines={1}>
          {label}
        </Text>
        <Text variant="caption" color={colors.text2} style={styles.centred}>
          {sub}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

/**
 * The composer's three-way anonymity picker with a live "They'll see" preview.
 * The chosen level belongs to the *action*, not the account: it is stored on the
 * row that gets written and never rewritten afterwards ([D5]).
 */
export function AnonymitySelector({
  value = 'anonymous',
  onChange,
  hintFields = { section: true },
  onHintFieldsChange,
  me = {},
  labels = {},
  style,
  testID,
}: AnonymitySelectorProps) {
  const { colors, radius } = useTheme();
  const { t } = useTranslation();

  const L = (key: AnonymitySelectorLabelKey): string => labels[key] ?? (t(`anon.${key}`) as string);

  const options: { id: AnonymityLevel; icon: IconName; label: string; sub: string }[] = [
    { id: 'anonymous', icon: 'VenetianMask', label: L('anonymous'), sub: L('anonymousSub') },
    { id: 'hint', icon: 'Sparkles', label: L('hint'), sub: L('hintSub') },
    { id: 'named', icon: 'User', label: L('named'), sub: L('namedSub') },
  ];

  const toggle = (key: keyof HintFields) =>
    onHintFieldsChange?.({ ...hintFields, [key]: !hintFields[key] });

  const hints =
    value === 'hint'
      ? {
          section: hintFields.section ? me.section : undefined,
          country: hintFields.country ? me.country : undefined,
          letter: hintFields.letter ? (me.name ?? '').charAt(0) : undefined,
        }
      : {};

  return (
    <View testID={testID} style={[styles.root, style]}>
      <View accessibilityRole="radiogroup" style={styles.row}>
        {options.map((o) => (
          <Option
            key={o.id}
            id={o.id}
            icon={o.icon}
            label={o.label}
            sub={o.sub}
            checked={value === o.id}
            onPress={() => onChange?.(o.id)}
          />
        ))}
      </View>

      {value === 'hint' ? (
        <HintsBox>
          <Text variant="captionCaps" color={colors.anonHint} upper style={styles.hintsLabel}>
            {L('showThem')}
          </Text>
          <Chip size="sm" icon="MapPin" selected={!!hintFields.section} onPress={() => toggle('section')}>
            {L('section')}
          </Chip>
          <Chip size="sm" icon="Flag" selected={!!hintFields.country} onPress={() => toggle('country')}>
            {L('country')}
          </Chip>
          <Chip size="sm" icon="CaseUpper" selected={!!hintFields.letter} onPress={() => toggle('letter')}>
            {L('letter')}
          </Chip>
        </HintsBox>
      ) : null}

      <View style={[styles.preview, { borderRadius: radius.md, borderColor: colors.borderStrong }]}>
        <Text variant="caption" color={colors.text2}>
          {L('preview')}
        </Text>
        <AnonymityBadge
          level={value}
          name={me.name}
          avatar={me.avatar}
          hints={hints}
          labels={{ anonymous: L('anonymous'), hint: L('hint') }}
          size="sm"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'column', gap: 10 },
  row: { flexDirection: 'row', gap: 8 },
  optionPress: { flex: 1 },
  option: { flex: 1, alignItems: 'center', gap: 8, minHeight: 88 },
  optionIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  centred: { textAlign: 'center' },
  hints: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: 12 },
  hintsLabel: { width: '100%' },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
});

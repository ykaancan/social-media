import React, { useState } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type NativeSyntheticEvent,
  type ReturnKeyTypeOptions,
  type StyleProp,
  type TextInputSubmitEditingEventData,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { tabularNums, useTheme } from '../../theme';
import { Text } from './Text';

export type InputType = 'text' | 'email' | 'tel' | 'password';

export interface InputProps {
  label?: string;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  /** Only meaningful with `multiline`; the web's <textarea rows>. */
  rows?: number;
  hint?: string;
  /** Takes precedence over `hint` and turns the box + footer red. */
  error?: string;
  maxLength?: number;
  type?: InputType;
  autoFocus?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Applied to the control itself (JoinSheet passes display type + tracking). */
  inputStyle?: StyleProp<TextStyle>;
  onSubmitEditing?: (e: NativeSyntheticEvent<TextInputSubmitEditingEventData>) => void;
  returnKeyType?: ReturnKeyTypeOptions;
  testID?: string;
}

const KEYBOARD: Record<InputType, KeyboardTypeOptions> = {
  text: 'default',
  email: 'email-address',
  tel: 'phone-pad',
  password: 'default',
};

/**
 * `.b-in` — labelled field, `multiline` for bios and the composer.
 *
 * `:focus-within` keeps its border-colour change (a real state on mobile); the
 * --focus-ring box-shadow that rides along with it is dropped, like every other
 * focus ring in the port.
 */
export function Input({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
  rows = 3,
  hint,
  error,
  maxLength,
  type = 'text',
  autoFocus,
  style,
  inputStyle,
  onSubmitEditing,
  returnKeyType,
  testID,
}: InputProps) {
  const { colors, radius, text } = useTheme();
  const [focused, setFocused] = useState(false);

  const v = value ?? '';
  const isError = Boolean(error);
  const borderColor = isError ? colors.danger : focused ? colors.text : colors.borderStrong;
  const footColor = isError ? colors.danger : colors.text2;
  const showFoot = Boolean(hint || error || maxLength);

  // .b-in__ctl is `min-height:48px` with 12px vertical padding; a textarea grows
  // by `rows` lines of the body line-height instead.
  const minHeight = multiline ? rows * text.body.lineHeight! + 24 : 48;

  return (
    <View style={[styles.root, style]}>
      {label ? (
        <Text variant="bodySmStrong" color={colors.text}>
          {label}
        </Text>
      ) : null}

      <View
        style={[
          styles.box,
          { backgroundColor: colors.surface, borderColor, borderRadius: radius.input },
        ]}
      >
        <TextInput
          testID={testID}
          accessibilityLabel={label}
          value={v}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.text3}
          multiline={multiline}
          maxLength={maxLength}
          autoFocus={autoFocus}
          keyboardType={KEYBOARD[type]}
          secureTextEntry={type === 'password'}
          autoCapitalize={type === 'email' || type === 'password' ? 'none' : 'sentences'}
          autoCorrect={type === 'email' || type === 'password' ? false : undefined}
          onSubmitEditing={onSubmitEditing}
          returnKeyType={returnKeyType}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[
            text.body,
            styles.ctl,
            { color: colors.text, minHeight },
            multiline ? styles.multiline : null,
            inputStyle,
          ]}
        />
      </View>

      {showFoot ? (
        <View style={styles.foot}>
          <Text variant="caption" color={footColor} style={styles.footLeft}>
            {error || hint || ''}
          </Text>
          {maxLength ? (
            <Text variant="caption" color={footColor} nums style={tabularNums}>
              {`${v.length}/${maxLength}`}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'column', gap: 6 },
  box: { flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1.5 },
  ctl: { flex: 1, minWidth: 0, paddingVertical: 12, paddingHorizontal: 14 },
  multiline: { textAlignVertical: 'top' },
  foot: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  footLeft: { flexShrink: 1 },
});

import React from 'react';
import { Text as RNText, type StyleProp, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { useLocale, type Locale } from '../../i18n';
import { tabularNums, useTheme, type TypographyVariant } from '../../theme';
import { upper as toUpper } from '../../utils/text';

export interface TextProps extends Omit<RNTextProps, 'style' | 'children'> {
  /** A typography token from tokens/typography.css. Defaults to body. */
  variant?: TypographyVariant;
  /** Defaults to the theme's text colour. */
  color?: string;
  /**
   * Uppercase the children. Uses the Turkish-aware `upper()` under the current
   * locale — NEVER `textTransform`, which uses the root locale and turns "i"
   * into "I" instead of the dotted capital in Turkish.
   */
  upper?: boolean;
  /**
   * The locale `upper` folds under. Defaults to the app locale; pass it only on
   * a surface that carries its own locale (HANDOFF: "one locale per surface" —
   * EventCard/StatusPill), where the app locale would be the wrong one.
   */
  locale?: Locale;
  /** Tabular figures, for counts and timestamps that must not jitter. */
  nums?: boolean;
  numberOfLines?: number;
  style?: StyleProp<TextStyle>;
  /** Must be a string or number when `upper` is set. */
  children?: React.ReactNode;
}

export function Text({
  variant = 'body',
  color,
  upper = false,
  locale,
  nums = false,
  numberOfLines,
  style,
  children,
  ...rest
}: TextProps) {
  const { colors, text } = useTheme();
  const appLocale = useLocale();
  const lng = locale ?? appLocale;

  let content = children;
  if (upper) {
    if (typeof children === 'string' || typeof children === 'number') {
      content = toUpper(String(children), lng);
    } else if (children != null) {
      throw new Error('<Text upper> requires a string or number child.');
    }
  }

  return (
    <RNText
      numberOfLines={numberOfLines}
      style={[text[variant], { color: color ?? colors.text }, nums ? tabularNums : null, style]}
      {...rest}
    >
      {content}
    </RNText>
  );
}

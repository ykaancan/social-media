import React from 'react';
import { Image, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';
import { useTranslation } from '../../i18n';
import { ink, tracking, useEventColor, useTheme } from '../../theme';
import { Button } from '../core/Button';
import { Text } from '../core/Text';

export interface JoinCodeBlockProps {
  /** 6 alphanumerics; rendered "K7Q 4ZM". */
  code?: string;
  /** A generated QR image. Without it a labelled placeholder is shown. */
  qrSrc?: string;
  /** Overrides the ambient event colour's soft tint. */
  eventColorSoft?: string;
  onCopy?: () => void;
  onShare?: () => void;
  labels?: { joinCode?: string; copy?: string; share?: string; qrPlaceholder?: string };
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const QR = 180;
/** the repeating-linear-gradient's 6px band inside a 12px period */
const STRIPE = 6;

/** "k7q4zm" -> "K7Q 4ZM". Never invents characters; only strips and groups. */
export function formatJoinCode(code: string): string {
  return code
    .replace(/[^A-Z0-9]/gi, '')
    .toUpperCase()
    .replace(/(.{3})(?=.)/g, '$1 ');
}

/**
 * repeating-linear-gradient(45deg, ink-100 0 6px, ink-0 6px 12px)
 *
 * RULE: a CSS `repeating-linear-gradient(θ, …)` lays its stripes PERPENDICULAR
 * to θ — θ is the direction the colour ramp travels, not the direction the bands
 * run. This pattern draws VERTICAL bands, so it has to be rotated by `θ − 90`
 * (equivalently `θ + 90`) to land on the same stripes. Here 45 − 90 = −45, which
 * runs the stripes top-left to bottom-right ("\"), exactly as the web does.
 */
function Hatch() {
  return (
    <Svg width={QR} height={QR} style={StyleSheet.absoluteFill}>
      <Defs>
        <Pattern
          id="joincode-hatch"
          x={0}
          y={0}
          width={STRIPE * 2}
          height={STRIPE * 2}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-45)"
        >
          <Rect x={0} y={0} width={STRIPE * 2} height={STRIPE * 2} fill={ink[0]} />
          <Rect x={0} y={0} width={STRIPE} height={STRIPE * 2} fill={ink[100]} />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width={QR} height={QR} fill="url(#joincode-hatch)" />
    </Svg>
  );
}

/** Join code + QR, shown to the creator and on the event detail screen. */
export function JoinCodeBlock({
  code = '',
  qrSrc,
  eventColorSoft,
  onCopy,
  onShare,
  labels = {},
  style,
  testID,
}: JoinCodeBlockProps) {
  const { colors, radius, text } = useTheme();
  const event = useEventColor();
  const { t } = useTranslation();

  const L = {
    joinCode: labels.joinCode ?? (t('events.joinCode') as string),
    copy: labels.copy ?? (t('common.copy') as string),
    share: labels.share ?? (t('common.share') as string),
    qrPlaceholder: labels.qrPlaceholder ?? (t('events.qrPlaceholder') as string),
  };

  // --display-xl is 64px; the token is typed as an optional TextStyle field
  const codeSize = text.displayXl.fontSize ?? 64;
  const codeTracking = tracking(0.08, codeSize);

  return (
    <View
      testID={testID}
      style={[
        styles.root,
        { borderRadius: radius.card, backgroundColor: eventColorSoft ?? event.soft },
        style,
      ]}
    >
      <Text variant="captionCaps" color={colors.text2} upper>
        {L.joinCode}
      </Text>

      <Text
        testID="join-code"
        variant="displayXl"
        color={colors.text}
        nums
        numberOfLines={1}
        // .08em tracking plus the same amount of left padding, so the last
        // letter's trailing space does not push the code off centre
        style={{ letterSpacing: codeTracking, paddingLeft: codeTracking }}
      >
        {formatJoinCode(code)}
      </Text>

      <View
        accessible
        accessibilityLabel={L.qrPlaceholder}
        style={[styles.qr, { borderRadius: radius.md, borderColor: colors.borderStrong }]}
      >
        <Hatch />
        {qrSrc ? (
          <Image
            source={{ uri: qrSrc }}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
            style={styles.qrImage}
          />
        ) : (
          <Text variant="caption" color={colors.text2} style={styles.qrLabel}>
            {L.qrPlaceholder}
          </Text>
        )}
      </View>

      <View style={styles.row}>
        <View style={styles.cell}>
          <Button variant="secondary" icon="Copy" full onPress={onCopy}>
            {L.copy}
          </Button>
        </View>
        <View style={styles.cell}>
          <Button icon="Share" full onPress={onShare}>
            {L.share}
          </Button>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'column', alignItems: 'center', gap: 16, paddingTop: 24, paddingHorizontal: 16, paddingBottom: 16 },
  qr: {
    width: QR,
    height: QR,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  qrImage: { width: '100%', height: '100%' },
  qrLabel: {
    // font: 500 12px/1.3 ui-monospace, Menlo, monospace
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  row: { flexDirection: 'row', gap: 8, width: '100%' },
  cell: { flex: 1 },
});

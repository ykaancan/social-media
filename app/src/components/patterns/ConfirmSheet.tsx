import React from 'react';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../theme';
import { Button } from '../core/Button';
import { Sheet } from '../core/Sheet';
import { Text } from '../core/Text';

export interface ConfirmSheetProps {
  busy?: boolean;
  disabled?: boolean;
  error?: string;
  title: string;
  /** One or two sentences. Already translated. */
  body: string;
  /** The confirm button's label — a verb, not "OK". */
  action: string;
  /** Defaults to true; pass false for a non-destructive confirm (reveal). */
  danger?: boolean;
  /** Optional block between the body and the buttons ("They'll see" + a badge). */
  preview?: React.ReactNode;
  cancelLabel?: string;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * The one confirmation dialog. Body, optional preview, one committing button
 * and a ghost Cancel — never a two-column row of equal-weight buttons.
 *
 * [D6]/[D12]: callers must not use it to claim content was "removed" when it is
 * hidden (block) or soft-deleted (inbox delete).
 */
export function ConfirmSheet({
  busy = false, disabled = false, error,
  title,
  body,
  action,
  danger = true,
  preview,
  cancelLabel,
  onClose,
  onConfirm,
}: ConfirmSheetProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <Sheet title={title} onClose={busy ? undefined : onClose} testID="confirm-sheet">
      <Text variant="body" color={colors.text2}>
        {body}
      </Text>
      {preview ?? null}
      {error && <Text accessibilityRole="alert" color={colors.danger}>{error}</Text>}
      <Button
        size="lg"
        full
        variant={danger ? 'danger' : 'primary'}
        onPress={onConfirm}
        loading={busy}
        disabled={busy||disabled}
        testID="confirm-action"
      >
        {action}
      </Button>
      <Button size="lg" full variant="ghost" onPress={onClose} disabled={busy} testID="confirm-cancel">
        {cancelLabel ?? t('common.cancel')}
      </Button>
    </Sheet>
  );
}

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../theme';
import { Button } from '../core/Button';
import { Chip } from '../core/Chip';
import { Sheet } from '../core/Sheet';
import { Tabs } from '../core/Tabs';
import { Text } from '../core/Text';
import type { BoardMode } from './CreateSheet';
import type { Translate } from './MoreSheet';

export interface ControlsSheetProps {
  mode: BoardMode;
  onMode: (mode: BoardMode) => void;
  /** The chosen end time ("02:00"), or null for "No end". */
  end: string | null;
  /** The times offered as chips, e.g. ['01:00', '02:00', '03:00']. */
  endOptions: string[];
  onEnd: (end: string | null) => void;
  /** Room posts still waiting on a decision. */
  pendingCount?: number;
  onCloseBoard: () => void;
  onClose: () => void;
}

/**
 * The body of the "close the board?" confirmation.
 *
 * [D4] Closing transitions every still-pending post to `rejected` with reason
 * `board_closed`, so the copy has to say those posts will not be published —
 * leaving a sender's post pending forever is exactly what that decision
 * forbids. Nothing is deleted: the board stays readable, archived.
 */
export function closeBoardConfirmBody(t: Translate, pendingCount = 0): string {
  return pendingCount > 0
    ? t('events.closeConfirmBodyWaiting', { n: pendingCount })
    : t('events.closeConfirmBody');
}

/**
 * Moderator controls for a live board: the board mode, when it ends, and the
 * close button.
 *
 * Switching to `post_immediately` does not clear the queue — posts already
 * waiting still need a decision, and the caption says so, because [D8] makes
 * every one of those decisions final.
 *
 * "Close board now" only calls back: the screen puts a `ConfirmSheet` in front
 * of it with `closeBoardConfirmBody()`.
 */
export function ControlsSheet({
  mode,
  onMode,
  end,
  endOptions,
  onEnd,
  pendingCount = 0,
  onCloseBoard,
  onClose,
}: ControlsSheetProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const modeCaption =
    mode === 'approve_first'
      ? t('events.modeWaits')
      : `${t('events.modeImmediate')}${
          pendingCount > 0 ? ` ${t('events.stillWaiting', { n: pendingCount })}` : ''
        }`;

  return (
    <Sheet title={t('events.boardControls')} onClose={onClose} testID="controls-sheet">
      <View style={styles.block}>
        <Text variant="captionCaps" upper color={colors.text2}>
          {t('events.boardMode')}
        </Text>
        <Tabs
          variant="segmented"
          value={mode}
          onChange={(id) => onMode(id as BoardMode)}
          items={[
            { id: 'approve_first', label: t('events.approveFirst') },
            { id: 'post_immediately', label: t('events.postImmediately') },
          ]}
          testID="controls-mode"
        />
        <Text variant="caption" color={colors.text2} testID="controls-mode-caption">
          {modeCaption}
        </Text>
      </View>

      <View style={styles.block}>
        <Text variant="captionCaps" upper color={colors.text2}>
          {t('events.endsLabel')}
        </Text>
        <View style={styles.chips}>
          {endOptions.map((v) => (
            <Chip key={v} selected={end === v} onPress={() => onEnd(v)}>
              {v}
            </Chip>
          ))}
          <Chip selected={end === null} onPress={() => onEnd(null)}>
            {t('events.noEnd')}
          </Chip>
        </View>
        <Text variant="caption" color={colors.text2}>
          {t('events.endsNote')}
        </Text>
      </View>

      <Button
        size="lg"
        full
        variant="danger"
        icon="Square"
        onPress={onCloseBoard}
        testID="controls-close-board"
      >
        {t('events.closeBoardNow')}
      </Button>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  block: { flexDirection: 'column', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});

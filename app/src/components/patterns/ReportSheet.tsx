import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../theme';
import { PostCard } from '../cards';
import { Button } from '../core/Button';
import { Chip } from '../core/Chip';
import { Sheet } from '../core/Sheet';
import { Text } from '../core/Text';
import type { PostPreview } from './ReplySheet';

/** HANDOFF §4 — the same five reasons in every prototype. */
export const REPORT_REASON_IDS = ['harassment', 'hate', 'sexual', 'identity', 'spam'] as const;

export type ReportReasonId = (typeof REPORT_REASON_IDS)[number];

export interface ReportReason {
  id: string;
  label: string;
}

export interface ReportSheetProps {
  /** Optional: the thread variant reports the whole thread, not one card. */
  post?: PostPreview;
  /** Defaults to the five fixed reasons, translated. */
  reasons?: ReportReason[];
  /** Thread variant: adds the "the whole thread goes to the admin" line. */
  threadNote?: boolean;
  onClose: () => void;
  onReport: (reasonId: string) => void;
}

/**
 * Report a post, a message or a thread. Reporting is the only path that
 * deanonymizes, and only for `super_admin`, whose every identity view is
 * audit-logged (brief §5) — so the copy promises the admin, never the reporter.
 *
 * [D6]/[D12]: nothing here says the content was removed. Reporting hides
 * nothing on its own; blocking hides, deleting soft-deletes.
 */
export function ReportSheet({ post, reasons, threadNote = false, onClose, onReport }: ReportSheetProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [reason, setReason] = useState<string | null>(null);

  const items: ReportReason[] =
    reasons ?? REPORT_REASON_IDS.map((id) => ({ id, label: t(`report.reasons.${id}`) }));

  return (
    <Sheet title={t('report.title')} onClose={onClose} testID="report-sheet">
      {post ? (
        <PostCard text={post.text} sender={post.sender} time={post.time} source={post.source} />
      ) : null}

      <Text variant="captionCaps" upper color={colors.text2}>
        {t('report.reason')}
      </Text>

      <View style={styles.reasons}>
        {items.map((r) => (
          <Chip key={r.id} selected={reason === r.id} onPress={() => setReason(r.id)}>
            {r.label}
          </Chip>
        ))}
      </View>

      {threadNote ? (
        <Text variant="bodySm" color={colors.text2}>
          {t('report.threadNote')}
        </Text>
      ) : null}

      <Button
        size="lg"
        full
        variant="danger"
        icon="Flag"
        disabled={!reason}
        onPress={() => reason && onReport(reason)}
        testID="report-submit"
      >
        {t('report.title')}
      </Button>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});

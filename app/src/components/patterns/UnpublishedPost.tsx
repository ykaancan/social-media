import React from 'react';
import { View } from 'react-native';
import type { BoardPost } from '../../api/board';
import { useTranslation } from '../../i18n';
import { PostCard } from '../cards';
import { StatusPill, Text } from '../core';

/** Sender-only status; rejected history is never converted back into a queue row. */
export function UnpublishedPost({ post, onRewrite, onDismiss }: { post: BoardPost; onRewrite?: () => void; onDismiss?: () => void }) {
  const { t } = useTranslation();
  return <View style={{gap: 8}} testID={`unpublished-${post.id}`}>
    <StatusPill status={post.state === 'pending' ? 'pending' : 'rejected'} />
    <Text variant="caption">{t('boardFlow.onlyYou')}</Text>
    <PostCard text={post.text} sender={post.sender} actions={post.state === 'rejected' ? [
      ...(onRewrite ? [{label:t('boardFlow.rewrite'),icon:'PenLine' as const,variant:'secondary' as const,onPress:onRewrite}] : []),
      ...(onDismiss ? [{label:t('boardFlow.dismiss'),variant:'ghost' as const,onPress:onDismiss}] : []),
    ] : undefined} />
  </View>;
}

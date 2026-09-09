import React from 'react';
import type { InboxMessage, MessageState, WallMessage } from '../../api/messages';
import { PostCard } from '../cards';
import { useTranslation } from '../../i18n';
import { messagePreview } from '../../messages/presentation';

/** Gates are off: every message is an ordinary PostCard, without lock decorations. */
export function MessageCard({ message, wall = false, onMore, onStateChange }: {
  message: WallMessage | InboxMessage; wall?: boolean; onMore?: () => void; onStateChange?: (state: MessageState) => void;
}) {
  const { t } = useTranslation();
  const state = 'state' in message ? message.state : undefined;
  return <PostCard {...messagePreview(message)} large={wall} approvedFromBoard={wall && message.approvedFromBoard}
    testID={`message-${message.id}`} onMore={onMore}
    actions={onStateChange && state ? [
      ...(state !== 'approved' ? [{ label: t('inbox.approveToWall'), icon: 'Check' as const,
        variant: state === 'new' ? 'primary' as const : 'secondary' as const, onPress: () => onStateChange('approved') }] : []),
      ...(state !== 'private' ? [{ label: t('inbox.keepPrivate'), icon: 'EyeOff' as const,
        variant: 'secondary' as const, onPress: () => onStateChange('private') }] : []),
    ] : undefined} />;
}

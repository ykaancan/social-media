import React, { useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import {
  EventCard,
  JoinCodeBlock,
  LockedCard,
  PendingState,
  PostCard,
  QueueCard,
  ThreadBubble,
  type QueueCardState,
} from '../../components/cards';
import { useTranslation } from '../../i18n';
import { covers } from '../../theme';
import { events, posts } from '../fixtures';
import { Frame, GallerySection, Specimen } from '../kit';

export function CardsSection({ onLayout }: { onLayout?: (e: LayoutChangeEvent) => void }) {
  const { t } = useTranslation();

  const [reactions, setReactions] = useState<Record<string, number>>({ '🔥': 12, '😂': 4 });
  const [mine, setMine] = useState<string | undefined>('🔥');
  const [queueState, setQueueState] = useState<QueueCardState>('pending');
  const [selected, setSelected] = useState(true);

  /** The real count moves; nothing here is fabricated (principle 4). */
  const react = (emoji: string) => {
    setReactions((prev) => {
      const next = { ...prev };
      if (mine) next[mine] = Math.max(0, (next[mine] ?? 0) - 1);
      if (mine !== emoji) next[emoji] = (next[emoji] ?? 0) + 1;
      return next;
    });
    setMine((m) => (m === emoji ? undefined : emoji));
  };

  const flash = (state: QueueCardState) => {
    setQueueState(state);
    setTimeout(() => setQueueState('pending'), 900);
  };

  return (
    <GallerySection
      id="cards"
      title="Cards"
      subtitle="cards.card.html — post (board/wall/inbox), locked, queue, event tiles, join code, thread, pending"
      onLayout={onLayout}
    >
      <Specimen label="PostCard · board">
        <PostCard
          text={posts.speaker}
          sender={{ level: 'hint', hints: { section: 'ESN Ankara' } }}
          time="2m"
          reactions={reactions}
          myReaction={mine}
          onReact={react}
          onReply={() => undefined}
          onMore={() => undefined}
          entering
        />
      </Specimen>

      <Specimen label="PostCard · inbox">
        <PostCard
          text={posts.karaoke}
          sender={{ level: 'anonymous' }}
          time="1h"
          source={events.np.name}
          onMore={() => undefined}
          actions={[
            { label: t('inbox.approveToWall'), icon: 'Check' },
            { label: t('inbox.keepPrivate'), variant: 'secondary' },
          ]}
        />
      </Specimen>

      <Specimen label="PostCard · wall">
        <PostCard
          text={posts.speakerTr}
          sender={{ level: 'named', name: 'Deniz Aksoy' }}
          time="Nov 14"
          approvedFromBoard
          large
        />
        <PostCard
          text={posts.kitchen}
          sender={{ level: 'hint', hints: { country: 'Italy', letter: 'Giulia' } }}
          time="Nov 15"
          eventOutline
          large
        />
      </Specimen>

      {/* Both the specimen's `length` (164 / 41, from cards.card.html) AND a real
          `text`: with the [D3] gate OFF these render as ordinary cards showing
          the text, and the day the flag flips the very same props draw the
          honesty bars from the real character count. */}
      <Specimen label="LockedCard · length 164 / 41 (gate OFF: ordinary cards)">
        <LockedCard
          level="hint"
          hints={{ country: 'Italy' }}
          length={164}
          text={posts.locked164}
          time="3h"
          source={events.np.name}
        />
        <LockedCard level="anonymous" length={41} text={posts.locked41} time="5h" />
      </Specimen>

      <Specimen label="LockedCard · unlocked (stage 1 — the [D3] plain rendering)">
        <LockedCard
          unlocked
          level="anonymous"
          text={posts.playlist}
          time="5h"
          source="National Platform 2026"
        />
      </Specimen>

      <Specimen label="QueueCard · pending / approved / rejected (tap to flash)">
        <QueueCard
          index={3}
          text={posts.kitchen}
          sender={{ level: 'anonymous' }}
          time="12s"
          state={queueState}
          onApprove={() => flash('approved')}
          onReject={() => flash('rejected')}
        />
      </Specimen>

      <Specimen label="QueueCard · selectable">
        <QueueCard
          index={4}
          text={posts.bus}
          sender={{ level: 'named', name: 'Ece Kara' }}
          time="40s"
          selectable
          selected={selected}
          onSelect={() => setSelected((s) => !s)}
        />
      </Specimen>

      <Specimen label="EventCard · single night · live / upcoming / archived">
        <EventCard
          name={events.kar.name}
          status="live"
          cover="lime"
          day="03"
          month={10}
          timeRange="21:00–01:00"
          scope="ESN Ankara"
          memberCount={64}
          postCount={188}
        />
        <EventCard
          name={events.izm.name}
          status="upcoming"
          cover="azure"
          day="22"
          month={11}
          timeRange="20:00"
          scope="ESN İzmir"
          memberCount={48}
          compact
        />
        <EventCard
          name="Boğaziçi Pub Quiz"
          status="archived"
          cover="tangerine"
          day="17"
          month={9}
          scope="ESN Boğaziçi"
          postCount={73}
          compact
        />
      </Specimen>

      <Specimen label="EventCard · multi-day · live / upcoming / archived">
        <EventCard
          name={events.np.name}
          status="live"
          cover="magenta"
          day="14"
          dayEnd="16"
          month={11}
          timeRange="Fri–Sun"
          scope={t('events.national')}
          memberCount={212}
          postCount={340}
        />
        <EventCard
          name={events.cap.name}
          status="upcoming"
          cover="mint"
          day="30"
          dayEnd="2"
          month={11}
          monthEnd={12}
          scope="ESN Ankara"
          memberCount={38}
          compact
        />
        <EventCard
          name={events.reg.name}
          status="archived"
          cover="violet"
          day="4"
          dayEnd="6"
          month={4}
          scope={t('events.national')}
          postCount={512}
          compact
        />
      </Specimen>

      <Specimen label='EventCard · same event, locale="en" then locale="tr" — month, pill and lang switch together'>
        <EventCard
          locale="en"
          name={events.np.name}
          status="upcoming"
          cover="magenta"
          day="14"
          dayEnd="16"
          month={11}
          scope="National"
          memberCount={212}
          compact
        />
        <EventCard
          locale="tr"
          name={events.np.name}
          status="upcoming"
          cover="magenta"
          day="14"
          dayEnd="16"
          month={11}
          scope="Ulusal"
          memberCount={212}
          compact
        />
      </Specimen>

      <Specimen label="ThreadBubble · theirs / mine / system / revealed">
        <Frame>
          <ThreadBubble text={posts.thread1} sender={{ level: 'hint', hints: { letter: 'Deniz' } }} time="22:14" />
          <ThreadBubble text={posts.thread2} mine time="22:15" />
          <ThreadBubble system text={t('anon.revealed', { name: 'Deniz' })} />
          <ThreadBubble text={posts.thread3} sender={{ level: 'named', name: 'Deniz Aksoy' }} time="22:16" />
        </Frame>
      </Specimen>

      <Specimen label="JoinCodeBlock">
        <JoinCodeBlock code={events.izm.code} eventColorSoft={covers.azure.soft} />
      </Specimen>
      <Specimen label="JoinCodeBlock · generated QR">
        <JoinCodeBlock code={events.izm.code} generateQr eventColorSoft={covers.azure.soft} />
      </Specimen>

      <Specimen label="PendingState">
        <PendingState
          title={t('onboarding.pendingTitle')}
          subtitle={t('onboarding.pendingSub')}
          steps={[
            { label: t('onboarding.stepSent'), done: true },
            { label: t('onboarding.stepReview'), current: true, description: t('onboarding.stepReviewDesc') },
            { label: t('onboarding.stepIn') },
          ]}
          note={t('onboarding.pendingNote')}
        />
        <PendingState
          title={t('reviewFlow.bannedTitle')}
          subtitle={t('reviewFlow.bannedBody')}
          steps={[]}
        />
      </Specimen>
    </GallerySection>
  );
}

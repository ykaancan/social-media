import React, { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../theme';
import { AnonymitySelector, type AnonymityLevel, type HintFields } from '../anonymity';
import { PostCard } from '../cards';
import { Button } from '../core/Button';
import { Icon } from '../core/Icon';
import { Input } from '../core/Input';
import { Sheet } from '../core/Sheet';
import { Text } from '../core/Text';
import { Note } from './Note';

/** post / wall message / reply-that-starts-a-thread — HANDOFF §4. */
export const REPLY_MAX = 280;

/**
 * How a sender is shown on a card. This is the *display* shape only: the server
 * always knows who wrote the row (CLAUDE.md §2.1), and the level travels with
 * the row it was sent at and is never rewritten ([D5]).
 */
export interface SenderView {
  level: AnonymityLevel;
  name?: string;
  avatar?: string;
  hints?: { section?: string; country?: string; letter?: string };
}

/** The subset of a post/message these sheets need in order to preview it. */
export interface PostPreview {
  text: string;
  sender?: SenderView;
  time?: string;
  source?: string;
}

/** The signed-in user, as the anonymity selector and `senderFor` need them. */
export interface MeView {
  name: string;
  avatar?: string;
  section?: string;
  /** [D11] read through the section, never a free-typed nationality. */
  country?: string;
}

/** "Deniz Aksoy" -> "Deniz". The prototypes' `first()`. */
export function firstName(name = ''): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

/**
 * Port of full-app.jsx line 173. Builds the card-sender for a level + the hint
 * fields the sender ticked. The web version writes `null` for an unticked hint;
 * RN props are optional rather than nullable, so unticked fields are simply
 * absent — same rendering, one less falsy shape to check.
 */
export function senderFor(me: MeView, level: AnonymityLevel, hintFields: HintFields = {}): SenderView {
  return {
    level,
    name: level === 'named' ? me.name : undefined,
    avatar: level === 'named' ? me.avatar : undefined,
    hints:
      level === 'hint'
        ? {
            section: hintFields.section ? me.section : undefined,
            country: hintFields.country ? me.country : undefined,
            letter: hintFields.letter ? me.name.charAt(0) : undefined,
          }
        : undefined,
  };
}

export interface ReplyPayload {
  screeningAcknowledged?: boolean;
  text: string;
  level: AnonymityLevel;
  hints: SenderView['hints'];
}

export interface ReplySheetProps {
  me: MeView;
  post: PostPreview;
  initialLevel?: AnonymityLevel;
  initialHintFields?: HintFields;
  onClose: () => void;
  onSend: (payload: ReplyPayload) => void | Promise<void>;
  onScreen?: (text: string) => Promise<{warning:boolean}>;
}

/**
 * "Reply privately" — opens a thread from a board post or an inbox message
 * (brief §4.7; no cold DMs in stage 1).
 *
 * The level picked here is the level the *first* message is sent at. It is
 * stored on that message and never rewritten; the level later messages go out
 * at lives on `thread_participant` ([D5]), which is the screen's business, not
 * this sheet's.
 */
export function ReplySheet({
  me,
  post,
  initialLevel = 'anonymous',
  initialHintFields = { section: true },
  onClose,
  onSend,
  onScreen,
}: ReplySheetProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const [text, setText] = useState('');
  const [level, setLevel] = useState<AnonymityLevel>(initialLevel);
  const [hintFields, setHintFields] = useState<HintFields>(initialHintFields);

  const [busy,setBusy]=useState(false), [error,setError]=useState(false), [warned,setWarned]=useState<string>();
  const running=useRef(false), draft=JSON.stringify([text.trim(),level,hintFields]);
  const warning=warned===draft;
  const canSend = text.trim().length > 0 && text.trim().length <= REPLY_MAX && (level!=='hint'||Object.values(hintFields).some(Boolean));
  const submit=async()=>{
    if(running.current||!canSend)return;running.current=true;setBusy(true);setError(false);
    try{
      if(onScreen&&!warning&&(await onScreen(text.trim())).warning){setWarned(draft);return;}
      await onSend({text:text.trim(),level,hints:senderFor(me,level,hintFields).hints,...(warning?{screeningAcknowledged:true}:{})});
    }catch{setError(true);}finally{running.current=false;setBusy(false);}
  };

  return (
    <Sheet title={t('inbox.replyPrivately')} onClose={busy?undefined:onClose} style={styles.sheet} testID="reply-sheet">
      <View style={styles.previewBlock}>
        <Text variant="captionCaps" upper color={colors.text2}>
          {t('composer.replyingTo')}
        </Text>
        <PostCard text={post.text} sender={post.sender} time={post.time} source={post.source} />
      </View>

      <Input
        multiline
        rows={3}
        autoFocus
        value={text}
        onChange={value=>{if(!running.current)setText(value);}}
        maxLength={REPLY_MAX}
        placeholder={t('thread.placeholder')}
        testID="reply-text"
      />

      <View style={styles.block}>
        <Text variant="captionCaps" upper color={colors.text2}>
          {t('composer.replyAs')}
        </Text>
        <AnonymitySelector
          value={level}
          onChange={value=>{if(!running.current)setLevel(value);}}
          hintFields={hintFields}
          onHintFieldsChange={value=>{if(!running.current)setHintFields(value);}}
          me={me}
        />
      </View>

      <View style={styles.hint}>
        <Icon name="Lock" size={16} color={colors.text2} />
        <Text variant="bodySm" color={colors.text2} style={styles.hintText}>
          {t('composer.threadNote')}
        </Text>
      </View>

      {warning&&<Note icon="TriangleAlert"><Text variant="bodySm">{t('composer.screeningWarning')} {t('composer.screeningDetail')}</Text></Note>}
      {error&&<Text accessibilityRole="alert" color={colors.danger}>{t('messageFlow.sendError')}</Text>}
      <Button
        testID="reply-send"
        loading={busy}
        size="lg"
        full
        icon="Send"
        disabled={!canSend||busy}
        onPress={()=>{void submit();}}
      >
        {t(warning?'messageFlow.sendAnyway':'composer.send')}
      </Button>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheet: { maxHeight: '94%' },
  previewBlock: { flexDirection: 'column', gap: 6 },
  block: { flexDirection: 'column', gap: 8 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hintText: { flex: 1, minWidth: 0 },
});

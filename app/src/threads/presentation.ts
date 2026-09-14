import type { ThreadMessage } from '../api';
import { t } from '../i18n';
export function threadMessageText(message:ThreadMessage){
  return message.system==='revealed'?t('threadFlow.revealed',{name:message.sender.name??t('threadFlow.someone')}):message.text;
}

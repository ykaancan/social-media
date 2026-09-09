import type { WallMessage } from '../api';
import { t } from '../i18n';

export function messagePreview(message: WallMessage) {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(message.createdAt)) / 60000));
  const time = minutes < 1 ? t('common.justNow') : minutes < 60 ? t('common.minutesShort', { n: minutes }) :
    minutes < 1440 ? t('common.hoursShort', { n: Math.floor(minutes / 60) }) : t('common.daysShort', { n: Math.floor(minutes / 1440) });
  return { text: message.text, sender: message.sender, time, source: message.source?.name };
}

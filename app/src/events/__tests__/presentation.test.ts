import { eventCard, sortEvents } from '../presentation';
import { initI18n } from '../../i18n';
import type { EventSummary } from '../../api';
initI18n();
const base: EventSummary = { id: 'a', name:'Trip',scope:'section',section:{id:'izmir',name:'ESN İzmir',country:'Türkiye'},country:'Türkiye',
  startsAt:'2026-11-30T20:00:00',endsAt:'2026-12-02T23:00:00',cover:'azure',boardMode:'approve_first',status:'upcoming',memberCount:2,postCount:0 };
it('orders live, upcoming, archived without mutating query results', () => {
  const events = [{...base,id:'old',status:'archived' as const},base,{...base,id:'live',status:'live' as const}];
  expect(sortEvents(events).map(e=>e.id)).toEqual(['live','a','old']);
  expect(events[0].id).toBe('old');
});
it('preserves cross-month dates and switches weekday labels with locale', () => {
  const en=eventCard(base,'en','National'),tr=eventCard(base,'tr','Ulusal');
  expect(en).toMatchObject({day:'30',month:11,dayEnd:'2',monthEnd:12,memberCount:2,postCount:0});
  expect(en.timeRange).not.toBe(tr.timeRange);
});

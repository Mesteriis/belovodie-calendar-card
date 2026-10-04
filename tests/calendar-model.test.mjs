import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig,normalizeEvents,eventsOnDay,dayRange,shiftDay,fetchCalendars } from '../src/calendar-model.js';
const zone='Europe/Madrid';
const source={entity:'calendar.example',color:'#48c7ef'};
test('config rejects non-calendar, duplicates and injectable CSS',()=>{
  for(const entities of [['light.example'],['calendar.a','calendar.a'],[{entity:'calendar.a',color:'red;display:none'}]]) assert.throws(()=>validateConfig({entities}));
  assert.throws(()=>validateConfig({entities:['calendar.a'],default_view:'year'}));
  assert.equal(validateConfig({entities:['calendar.a']}).default_view,'day');
});
test('all-day end is exclusive and spans retain preceding days',()=>{
  const events=normalizeEvents([{summary:'Trip',start:'2026-10-04',end:'2026-10-06',all_day:true}],source,zone);
  assert.equal(eventsOnDay(events,'2026-10-04',zone).length,1);
  assert.equal(eventsOnDay(events,'2026-10-05',zone).length,1);
  assert.equal(eventsOnDay(events,'2026-10-06',zone).length,0);
});
test('calendar day range follows DST rather than fixed 24 hours',()=>{
  const spring=dayRange('2026-03-29',zone),autumn=dayRange('2026-10-25',zone);
  assert.equal((Date.parse(spring.end)-Date.parse(spring.start))/3600000,23);
  assert.equal((Date.parse(autumn.end)-Date.parse(autumn.start))/3600000,25);
  assert.equal(shiftDay('2026-12-31',1,zone),'2027-01-01');
});
test('overnight event remains present on both days, offsets normalize',()=>{
  const events=normalizeEvents([{summary:'Overnight',start:'2026-10-04T23:30:00+02:00',end:'2026-10-05T01:00:00+02:00'}],source,zone);
  assert.equal(eventsOnDay(events,'2026-10-05',zone).length,1);
  assert.equal(eventsOnDay(events,'2026-10-03',zone).length,0);
});
test('bad payloads do not silently become no events',()=>{
  assert.throws(()=>normalizeEvents({},source,zone));
  assert.throws(()=>normalizeEvents([{start:'bad',end:'bad'}],source,zone));
  assert.throws(()=>normalizeEvents([{start:'2026-10-05',end:'2026-10-04'}],source,zone));
});
test('native Home Assistant date and dateTime objects normalize correctly',()=>{
  const events=normalizeEvents([{start:{date:'2026-10-04'},end:{date:'2026-10-05'}},{start:{dateTime:'2026-10-05T10:00:00+02:00'},end:{dateTime:'2026-10-05T11:00:00+02:00'}}],source,zone);
  assert.equal(events[0].allDay,true);assert.equal(events[1].allDay,false);
  assert.equal(events[1].start,'2026-10-05T10:00:00+02:00');
  assert.equal(eventsOnDay(events,'2026-10-05',zone).length,1);
});
test('partial source failure is reported while successful events survive',async()=>{
  const hass={callApi:async(method,path)=>{assert.equal(method,'GET');if(path.includes('calendar.bad'))throw Error('offline');return [{summary:'Event',start:'2026-10-04',end:'2026-10-05'}];}};
  const result=await fetchCalendars(hass,[source,{entity:'calendar.bad',color:'#ffaaaa'}],dayRange('2026-10-04',zone),zone);
  assert.equal(result.events.length,1);assert.deepEqual(result.failed,['calendar.bad']);
});

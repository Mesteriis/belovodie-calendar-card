import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig,normalizeEvents,eventsOnDay,dayRange,shiftDay,fetchCalendars } from '../src/calendar-model.js';
import * as calendarModel from '../src/calendar-model.js';
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
  const hass={callApi:async(method,path)=>{assert.equal(method,'GET');if(path==='calendars')return [{entity_id:source.entity},{entity_id:'calendar.bad'}];if(path.includes('calendar.bad'))throw Error('offline');return [{summary:'Event',start:'2026-10-04',end:'2026-10-05'}];}};
  const result=await fetchCalendars(hass,[source,{entity:'calendar.bad',color:'#ffaaaa'}],dayRange('2026-10-04',zone),zone);
  assert.equal(result.events.length,1);assert.deepEqual(result.failed,['calendar.bad']);
});
test('removed calendar disappears without querying its stale registry entity',async()=>{
  const stale={entity:'calendar.deleted',color:'#ffaaaa'},paths=[];
  const hass={callApi:async(method,path)=>{paths.push(path);return path==='calendars'?[{entity_id:source.entity}]:[];}};
  const result=await fetchCalendars(hass,[source,stale],dayRange('2026-10-04',zone),zone);
  assert.deepEqual(result.sources,[source]);assert.deepEqual(result.failed,[]);
  assert.equal(paths.some(path=>path.includes(stale.entity)),false);
  assert.equal(result.inventoryFailed,false);
});
test('inventory outage retains configured calendars and exposes the failure',async()=>{
  const hass={callApi:async(method,path)=>{if(path==='calendars')throw Error('network');return [];}};
  const result=await fetchCalendars(hass,[source],dayRange('2026-10-04',zone),zone);
  assert.deepEqual(result.sources,[source]);assert.equal(result.inventoryFailed,true);
  assert.deepEqual(result.failed,[]);
});

const bridgeAttributes={local_health:'complete',remote_health:'unknown',stale:false,last_successful_sync:'2026-03-29T09:00:00+02:00',range_start:'2026-03-29T00:00:00+01:00',range_end:'2026-03-30T00:00:00+02:00'};
function bridgeHass(attributes,raw=[]) {
  const queries=[];
  return {queries,states:{[source.entity]:{attributes}},callApi:async(method,path)=>{
    if(path==='calendars')return [{entity_id:source.entity}];
    queries.push(new URLSearchParams(path.split('?')[1]));return raw;
  }};
}
test('bounded snapshot intersects wider view with its DST-aware exported window',async()=>{
  const hass=bridgeHass(bridgeAttributes,[{summary:'Retained',start:'2026-03-29',end:'2026-03-30'}]);
  const result=await fetchCalendars(hass,[source],{start:'2026-03-28T00:00:00+01:00',end:'2026-03-31T00:00:00+02:00'},zone);
  assert.equal(hass.queries[0].get('start'),bridgeAttributes.range_start);
  assert.equal(hass.queries[0].get('end'),bridgeAttributes.range_end);
  assert.equal(result.events.length,1);assert.deepEqual(result.failed,[]);
  assert.equal(result.statuses[source.entity].coverage,'partial');
});
test('out-of-window dates never query snapshot or masquerade as covered emptiness',async()=>{
  const hass=bridgeHass(bridgeAttributes);
  const result=await fetchCalendars(hass,[source],dayRange('2026-03-30',zone),zone);
  assert.equal(hass.queries.length,0);assert.deepEqual(result.events,[]);
  assert.equal(result.statuses[source.entity].coverage,'none');
});
test('failed local read exposes last success and stale state while cached originals survive',async()=>{
  const hass=bridgeHass({...bridgeAttributes,local_health:'failed',stale:true},[{summary:'Retained',start:'2026-03-29',end:'2026-03-30'}]);
  const result=await fetchCalendars(hass,[source],dayRange('2026-03-29',zone),zone);
  assert.equal(result.events[0].title,'Retained');assert.deepEqual(result.failed,[]);
  assert.equal(result.statuses[source.entity].localHealth,'failed');assert.equal(result.statuses[source.entity].stale,true);
  assert.equal(result.statuses[source.entity].lastSuccessfulSync,bridgeAttributes.last_successful_sync);
});
test('snapshot without successful range stays uncovered and ordinary calendars remain unbounded',async()=>{
  for(const attributes of [{local_health:'missing',range_start:null,range_end:null},{...bridgeAttributes,range_end:'invalid'}]) {
    const hass=bridgeHass(attributes),result=await fetchCalendars(hass,[source],dayRange('2026-03-29',zone),zone);
    assert.equal(hass.queries.length,0);assert.equal(result.statuses[source.entity].coverage,'none');
  }
  const hass=bridgeHass({friendly_name:'CalDAV'}),range=dayRange('2026-03-29',zone);
  const result=await fetchCalendars(hass,[source],range,zone);
  assert.equal(hass.queries[0].get('start'),range.start);assert.equal(hass.queries[0].get('end'),range.end);
  assert.equal(result.statuses[source.entity].coverage,'complete');
});

test('status warnings use selected-day coverage and keep stale/failure separate',()=>{
  assert.equal(typeof calendarModel.calendarWarnings,'function','warning classification must be available');
  const {calendarWarnings}=calendarModel;
  const status={bounded:true,rangeStart:bridgeAttributes.range_start,rangeEnd:bridgeAttributes.range_end,localHealth:'failed',stale:true};
  assert.deepEqual(calendarWarnings(status,dayRange('2026-03-29',zone),zone),['failed','stale']);
  assert.deepEqual(calendarWarnings(status,dayRange('2026-03-30',zone),zone),['failed','stale','none']);
  assert.deepEqual(calendarWarnings({...status,localHealth:'complete',stale:false},{start:'2026-03-28T00:00:00+01:00',end:'2026-03-31T00:00:00+02:00'},zone),['partial']);
  assert.deepEqual(calendarWarnings({bounded:false},dayRange('2026-03-29',zone),zone),[]);
});

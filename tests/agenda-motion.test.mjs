import test from 'node:test';
import assert from 'node:assert/strict';
import {unfinishedEvents,agendaDelay} from '../src/agenda-motion.js';
import {validateConfig,normalizeEvents} from '../src/calendar-model.js';

test('motion is opt-in and validates configuration',()=>{
  assert.equal(validateConfig({entities:['calendar.family']}).agenda_animation,'none');
  assert.equal(validateConfig({entities:['calendar.family'],agenda_animation:'flight'}).agenda_animation,'flight');
  assert.throws(()=>validateConfig({entities:['calendar.family'],agenda_animation:'archive'}));
});
test('completion uses exclusive end, not start; does not mutate event data',()=>{
  const events=[{startMs:0,endMs:1000},{startMs:2000,endMs:3000}];
  assert.deepEqual(unfinishedEvents(events,999),events);
  assert.deepEqual(unfinishedEvents(events,1000),[events[1]]);
  assert.equal(events.length,2);
});
test('next deadline handles simultaneous completions, late clock, empty list and timer limit',()=>{
  assert.equal(agendaDelay([3000,1000,1000],500),500);
  assert.equal(agendaDelay([1000],1000),0);
  assert.equal(agendaDelay([1000],1500),0);
  assert.equal(agendaDelay([],0),null);
  assert.equal(agendaDelay([1e13],0),2147483647);
});
test('all-day exclusive midnight and overnight completion retain timezone semantics',()=>{
  const events=normalizeEvents([
    {start:'2026-10-25',end:'2026-10-26',summary:'All day'},
    {start:'2026-10-25T23:00:00+01:00',end:'2026-10-26T02:00:00+01:00',summary:'Overnight'}
  ],{entity:'calendar.family',color:'#48c7ef'},'Europe/Madrid');
  const midnight=Date.parse('2026-10-26T00:00:00+01:00');
  assert.equal(unfinishedEvents(events,midnight-1).length,2);
  assert.deepEqual(unfinishedEvents(events,midnight),[events[1]]);
  assert.equal(unfinishedEvents(events,events[1].endMs).length,0);
});

import { DateTime } from 'luxon';

export const VIEWS = { day:'timeGridDay', week:'timeGridWeek', month:'dayGridMonth' };
export const COLORS = ['#48c7ef','#ff8a85','#bc95ed','#edbd61'];

export function validateConfig(config) {
  if (config.time_zone && !DateTime.now().setZone(config.time_zone).isValid) throw new Error('Invalid time_zone');
  if (!Array.isArray(config.entities) || !config.entities.length) throw new Error('entities must contain calendar entities');
  const entities = config.entities.map((value,index) => {
    const source = typeof value === 'string' ? {entity:value} : value;
    if (!source || !/^calendar\.[a-z0-9_]+$/.test(source.entity)) throw new Error('Invalid calendar entity');
    if (source.color && !/^#[0-9a-f]{6}$/i.test(source.color)) throw new Error('Calendar colors must be #RRGGBB');
    if (source.name != null && typeof source.name !== 'string') throw new Error('Calendar name must be text');
    return {entity:source.entity,name:source.name || null,color:source.color || COLORS[index % COLORS.length]};
  });
  if (new Set(entities.map(e=>e.entity)).size !== entities.length) throw new Error('Duplicate calendar entity');
  const view=config.default_view || 'day';
  if (!VIEWS[view]) throw new Error('default_view must be day, week or month');
  const start=config.start_hour ?? 7, end=config.end_hour ?? 23;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start<0 || end>24 || start>=end) throw new Error('Invalid hour range');
  const height=config.height ?? '600px';
  if (!(typeof height==='number' && height>=320) && !(typeof height==='string' && /^(?:100%|\d+(?:px|vh|dvh))$/.test(height))) throw new Error('Invalid height');
  return {...config,entities,default_view:view,start_hour:start,end_hour:end,height:typeof height==='number'?`${height}px`:height};
}

export function dayKey(date,zone) {
  return DateTime.fromJSDate(date,{zone}).toISODate();
}
export function shiftDay(key,days,zone) {
  return DateTime.fromISO(key,{zone}).plus({days}).toISODate();
}
export function dayRange(key,zone) {
  const start=DateTime.fromISO(key,{zone}).startOf('day');
  return {start:start.toISO(),end:start.plus({days:1}).toISO()};
}
export function eventsOnDay(events,key,zone) {
  const {start,end}=dayRange(key,zone);
  const from=DateTime.fromISO(start).toMillis(),until=DateTime.fromISO(end).toMillis();
  return events.filter(event=>event.endMs>from && event.startMs<until).sort((a,b)=>a.startMs-b.startMs || a.title.localeCompare(b.title));
}

export function normalizeEvents(raw,source,zone) {
  if (!Array.isArray(raw)) throw new Error('Invalid calendar response');
  return raw.map((event,index)=>{
    if (!event || typeof event.start!=='string' || typeof event.end!=='string') throw new Error('Invalid event dates');
    const start=DateTime.fromISO(event.start,{zone}),end=DateTime.fromISO(event.end,{zone});
    if (!start.isValid || !end.isValid || end.toMillis()<=start.toMillis()) throw new Error('Invalid event interval');
    return {id:`${source.entity}:${index}:${event.start}`,title:event.summary || 'Без названия',start:event.start,end:event.end,
      startMs:start.toMillis(),endMs:end.toMillis(),allDay:event.all_day===true || /^\d{4}-\d{2}-\d{2}$/.test(event.start),
      backgroundColor:`${source.color}30`,borderColor:source.color,textColor:'#dceef5',
      extendedProps:{source:source.entity,color:source.color,location:typeof event.location==='string'?event.location:'',description:typeof event.description==='string'?event.description:''}};
  });
}

// Partial failures remain visible. A failed source never turns into an empty successful calendar.
export async function fetchCalendars(hass,sources,range,zone) {
  const query=new URLSearchParams({start:range.start,end:range.end});
  const results=await Promise.allSettled(sources.map(async source=>normalizeEvents(await hass.callApi('GET',`calendars/${source.entity}?${query}`),source,zone)));
  return {events:results.flatMap(result=>result.status==='fulfilled'?result.value:[]),
    failed:sources.filter((_,i)=>results[i].status==='rejected').map(source=>source.entity)};
}

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
  const animation=config.agenda_animation ?? 'none';
  if(!['none','flight'].includes(animation))throw new Error('agenda_animation must be none or flight');
  const view=config.default_view || 'day';
  if (!VIEWS[view]) throw new Error('default_view must be day, week or month');
  const start=config.start_hour ?? 7, end=config.end_hour ?? 23;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start<0 || end>24 || start>=end) throw new Error('Invalid hour range');
  const height=config.height ?? '600px';
  if (!(typeof height==='number' && height>=320) && !(typeof height==='string' && /^(?:100%|\d+(?:px|vh|dvh))$/.test(height))) throw new Error('Invalid height');
  return {...config,entities,agenda_animation:animation,default_view:view,start_hour:start,end_hour:end,height:typeof height==='number'?`${height}px`:height};
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
    if (!event) throw new Error('Invalid event');
    const startValue=typeof event.start==='string'?event.start:event.start?.dateTime || event.start?.date;
    const endValue=typeof event.end==='string'?event.end:event.end?.dateTime || event.end?.date;
    if (typeof startValue!=='string' || typeof endValue!=='string') throw new Error('Invalid event dates');
    const start=DateTime.fromISO(startValue,{zone}),end=DateTime.fromISO(endValue,{zone});
    if (!start.isValid || !end.isValid || end.toMillis()<=start.toMillis()) throw new Error('Invalid event interval');
    return {id:`${source.entity}:${index}:${startValue}`,title:event.summary || 'Без названия',start:startValue,end:endValue,
      startMs:start.toMillis(),endMs:end.toMillis(),allDay:event.all_day===true || /^\d{4}-\d{2}-\d{2}$/.test(startValue),
      backgroundColor:`${source.color}30`,borderColor:source.color,textColor:'#dceef5',
      extendedProps:{source:source.entity,color:source.color,location:typeof event.location==='string'?event.location:'',description:typeof event.description==='string'?event.description:''}};
  });
}

// Explicit receiver ranges use aware instants; absence of range attributes leaves
// ordinary native calendars unbounded. Invalid/missing snapshot bounds fail closed.
function awareMillis(value) {
  if(typeof value!=='string' || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value))return NaN;
  return DateTime.fromISO(value).toMillis();
}
export function coverageForRange(status,range,zone) {
  if(!status?.bounded)return 'complete';
  const start=awareMillis(status.rangeStart),end=awareMillis(status.rangeEnd);
  const from=DateTime.fromISO(range.start,{zone}).toMillis(),until=DateTime.fromISO(range.end,{zone}).toMillis();
  if(!Number.isFinite(start) || !Number.isFinite(end) || start>=end || end<=from || start>=until)return 'none';
  return start<=from && end>=until?'complete':'partial';
}

export function calendarWarnings(status,range,zone) {
  const warnings=[];
  if(status?.localHealth==='failed' || status?.localHealth==='missing')warnings.push(status.localHealth);
  if(status?.stale)warnings.push('stale');
  const coverage=coverageForRange(status,range,zone);
  if(coverage!=='complete')warnings.push(coverage);
  return warnings;
}

// Partial failures remain visible. A failed source never turns into an empty successful calendar.
export async function fetchCalendars(hass,sources,range,zone) {
  // The native list contains loaded calendar entities; restored registry ghosts
  // are absent after the provider integration refreshes its inventory.
  let active=sources,inventoryFailed=false;
  try {
    const inventory=await hass.callApi('GET','calendars');
    if (!Array.isArray(inventory) || inventory.some(item=>!item || typeof item.entity_id!=='string')) throw new Error('Invalid calendar inventory');
    const existing=new Set(inventory.map(item=>item.entity_id));
    active=sources.filter(source=>existing.has(source.entity));
  } catch { inventoryFailed=true; }
  const statuses=Object.fromEntries(active.map(source=>{
    const attributes=hass.states?.[source.entity]?.attributes || {};
    const status={bounded:'range_start' in attributes || 'range_end' in attributes,
      rangeStart:attributes.range_start,rangeEnd:attributes.range_end,
      localHealth:attributes.local_health,stale:attributes.stale===true,
      lastSuccessfulSync:attributes.last_successful_sync};
    status.coverage=coverageForRange(status,range,zone);
    return [source.entity,status];
  }));
  const results=await Promise.allSettled(active.map(async source=>{
    const status=statuses[source.entity];
    if(status.coverage==='none')return [];
    const start=status.bounded && awareMillis(status.rangeStart)>DateTime.fromISO(range.start,{zone}).toMillis()?status.rangeStart:range.start;
    const end=status.bounded && awareMillis(status.rangeEnd)<DateTime.fromISO(range.end,{zone}).toMillis()?status.rangeEnd:range.end;
    const query=new URLSearchParams({start,end});
    return normalizeEvents(await hass.callApi('GET',`calendars/${source.entity}?${query}`),source,zone);
  }));
  return {events:results.flatMap(result=>result.status==='fulfilled'?result.value:[]),
    failed:active.filter((_,i)=>results[i].status==='rejected').map(source=>source.entity),sources:active,inventoryFailed,statuses};
}

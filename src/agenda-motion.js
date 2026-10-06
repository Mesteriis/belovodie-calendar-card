// Only presentation is filtered: the calendar grid and provider data stay intact.
export function unfinishedEvents(events,now) {
  return events.filter(event=>event.endMs>now);
}
export function agendaDelay(ends,now) {
  if(!ends.length)return null;
  return Math.min(2147483647,Math.max(0,Math.min(...ends)-now));
}

# Belovodie Calendar Card

A focused Home Assistant calendar workspace: day timeline, week timeline and month grid, with one shared selected date, source filters, a day agenda and event details. Default view: day. Uses Home Assistant's native calendar API, so CalDAV/iCloud, Google and other `calendar.*` integrations work without credentials in the card.

## Install through HACS

Add `https://github.com/Mesteriis/belovodie-calendar-card` as a custom **Dashboard** repository, download, and reload the browser. Resource (module): `/hacsfiles/belovodie-calendar-card/belovodie-calendar-card.js`.

```yaml
type: custom:belovodie-calendar-card
default_view: day
height: 600px
entities:
  - entity: calendar.family
    name: Family
    color: '#ff8a85'
  - entity: calendar.personal
    name: Personal
    color: '#bc95ed'
```

Use `height: 100%` inside a dashboard container with a defined height. Optional `start_hour: 7`, `end_hour: 23`, `time_zone` (defaults to HA), and `language` (defaults to HA). Month weeks start on Monday. Colors must be six-digit hex. YAML configuration is supported; a custom visual editor is not included.

View changes preserve the selected date and source filters for the lifetime of the card. Date arrows move one day/week/month according to the active view. Month/week dates select the sidebar day. Events open a keyboard-accessible details dialog. All-day events use exclusive end dates; multi-day and overnight events appear on every overlapping day. Descriptions are rendered as text, never HTML. The card does not create or edit events. Refresh occurs every five minutes, when a calendar entity changes, and when the page becomes visible. Failed sources are named and can be retried; partial failures are never shown as an entirely successful empty calendar.

The card fills its configured height; calendar and agenda can scroll internally. At narrow widths the agenda collapses, leaving the calendar and view switch accessible. CSS variables `--bc-calendar-surface`, `--bc-calendar-text`, and `--bc-calendar-border` override the default dark teal appearance.

Inside Belovodie Dashboard the inherited `--bc-ui-scale` automatically compensates FullCalendar geometry for panel zoom. Other zoomed hosts can supply `--bc-calendar-scale` with their effective CSS zoom factor. Ordinary unzoomed hosts need no setting. Browser zoom does not need compensation.

## Development

```sh
npm ci
npm test
npm run build
```

The root JS bundle is committed and published as a GitHub release asset. Calendar dates and rendering use FullCalendar (MIT) and Luxon (MIT); the component uses Lit (BSD-3-Clause). All dependencies are bundled: no CDN or external runtime scripts.

## Existing-card research

Reviewed [Daylight Calendar Card](https://github.com/superdingo101/daylight-calendar-card), [FullCalendar Hass Card](https://github.com/sancons20/fullcalendar-hass-card), and [Month Calendar Card](https://github.com/drmogie/ha-month-calendar-card) before implementation. Those provide useful calendar views; this separate package implements the selected Belovodie composition with a shared day/week/month state, persistent source filters within the card, and a selected-day sidebar. The calendar engine is reused through the official FullCalendar packages rather than reimplementing time-grid rendering.

## Provider calendar removal

Each refresh first reads the native `/api/calendars` inventory. Configured calendars absent from that successful inventory disappear from the source filters and event queries. Temporary inventory failures preserve the configured calendars and show a retryable message; an event fetch failure does not mean the source was deleted.

CalDAV discovers provider calendars when its integration loads. For automatic provider inventory updates, merge [examples/caldav-refresh.yaml](examples/caldav-refresh.yaml) into your Home Assistant automation configuration. It reloads only CalDAV entries every 15 minutes, without changing credentials or deleting calendars at the provider. The card refreshes every five minutes and on entity changes. A provider deletion can therefore take an inventory refresh to appear. Home Assistant may retain an unavailable entity registry record; the card no longer queries or displays it.

Use `name` to identify people, for example `Owner · Personal`, `Owner · Work`, or `Shared · Family`. Include shared calendars once to avoid duplicate events.

## Bounded bridge snapshots

Sources exposing `range_start`/`range_end` are queried only for the intersection
with the selected view. Compact source status chips show partial/no coverage,
stale copies, failed/missing local reads, and the last successful local timestamp.
Retained snapshot originals remain visible during a failed local read. Dates beyond
coverage are never presented as trustworthy empty calendars; the day agenda uses
that day's coverage independently of the wider grid. Ordinary calendar integrations
without explicit bounds keep their normal date queries. These states describe
local exported data and do not establish cloud account freshness.

## Compact agenda completion motion

Opt in with `agenda_animation: flight` on the compact home agenda. Events already
finished at first load are omitted. At the exclusive end instant (including
all-day and overnight events), visible rows fly right and their space closes over
500 ms. No calendar events are edited or deleted, and the full calendar grid is
unchanged. Default `none` retains the original agenda with dimmed past events.
Reduced-motion preference removes completed rows immediately. Hidden pages and
reconnection reconcile current time without replaying old departures. The next
end is scheduled locally, independently of the five-minute provider refresh.

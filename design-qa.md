# Calendar card design QA

**Findings**
No remaining actionable P0/P1/P2 issues in the tested states.

**Evidence**
- Source visual truth: selected combined day/week/month concept, retained privately as `.local/source.png` (1549 × 1015).
- Rendered implementation: `.local/day-card.png` (1523 × 750); full panel `.local/day-2200.png`; compact panel `.local/day-tablet.png`.
- Full-view comparison: `.local/comparison.png`, opened with source and live capture together. The source includes the existing Today/Weather navigation; the component capture excludes that outer navigation. Images normalized to a common 790 px content width without stretching.
- CSS viewport: 2200 × 1440 and 1280 × 800; device pixel ratio 1.04, dashboard density baseline 0.8. Screenshots are browser-provided pixels; density normalization used for comparison only.
- State: day view with real provider events, selected next weekday; four sources enabled. Source illustrative events differ from live data. Screenshots and provider data remain ignored, never included in the published package.
- Focused regions: date/filter header, event blocks and source colors, sidebar time/title hierarchy, view switch inspected at normal browser size.

**Required fidelity surfaces**
- Typography: native Roboto fallback, 500 weight headings and event titles, smaller time/source labels. Compact sizes follow the accepted dashboard density rather than enlarging the illustrative mock. No overlapping labels at tested sizes.
- Spacing: main grid/sidebar proportion 2.2:1, separated by a thin divider; 22 px outer radius, compact date controls. The calendar adapts to the panel height and keeps internal scrolling available. No page scroll or card overflow at either tested viewport.
- Colors: dark teal surface, cyan active view and time marker; consistent source colors in filters, events and agenda. Event fills use translucent source colors.
- Assets: standard Home Assistant MDI checkboxes and navigation icons. The selected calendar design has no photographic or decorative image assets.
- Copy/content: Russian view controls and date grammar; actual calendar names, times and events. Empty and partial failure messages are explicit, with retry. No illustrative events shipped.

**Comparison history**
1. P1: native Home Assistant event date objects were rejected. Fixed normalization for date/dateTime objects; regression test added. Post-fix: real source events visible and error count zero.
2. P1: calendar vendor styles were lost inside the Home Assistant shadow DOM. Bundled official pinned FullCalendar CSS as static component styles. Post-fix: day/week/month grids rendered.
3. P2: ancestor panel zoom shifted event geometry and the current-time indicator. Cancelled panel zoom for calendar measurements while scaling typography. Post-fix: measured and rendered grid widths agree; events and time marker align.
4. P2: minimum component height overflowed short workspaces. Removed forced minimum on the internal card. Post-fix: card bottom matches host bottom, with zero page overflow at 1280 × 800 and 2200 × 1440.

**Interactions / validation**
- Date navigation, all three views, source filters retained across switches, selecting a month date then switching to day.
- Event details opened with Enter and closed; native dialog with escaped text.
- No calendar-specific console errors observed. Existing unrelated frontend warnings are outside this package.
- Seven model tests passed; build passed; bundled installed artifact hash matched the release candidate.

**Open Questions**
None blocking. Provider content differs intentionally from illustrative source data.

**Implementation Checklist**
- [x] Live provider data and native dates
- [x] Day/week/month shared date and filters
- [x] Event details and keyboard access
- [x] Constrained height and density
- [x] Separate HACS repository and bundled dependencies

**Follow-up Polish**
P3: optional selected-date highlighting in month view; selected date is already shown in the sidebar.

final result: passed

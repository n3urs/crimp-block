# Phase 4 — Calendar: Design

**Status:** Written and self-reviewed autonomously (Oscar stepped away with an explicit "keep going until out of usage" instruction). Every judgment call below is called out explicitly for his later review rather than asked live — flag anything that should change.

## Context

Per the Phase 0-2 plan's roadmap, phases 3+ get their own plans once earlier phases prove the RN component-mapping patterns. Phase 3 (Timers) just did that a second time (live-verified, 2 real bugs found and fixed). This phase ports the calendar screen — reachable from the header's calendar icon, currently a no-op (`onTapCalendar` in `card.tsx`).

## Swift source of truth

`ios/CrimpBlock/CalendarView.swift` (774 lines, one file: the view, `PartialBorder` (a custom `Shape`), and `TrendForecast`). Presented as a `.sheet` from `NativeAppView.swift:178-181`, given `bridge` (EngineBridge) and `history: [String: NativeStore.Entry]` (i.e. RN's `useStore().days`).

**Engine surface needed — already fully present in `src/engine/index.ts`, zero engine changes required for this phase:** `today()`, `addDays()`, `decide()`, `block()`, `phaseNameAt()`, `isDeload()`, `isTraining()`, `phaseIndexAt()`, `phases` (getter), `programStartDate()`, `sessionColourVarName()`, `sessionInfo()`, `SESSION_ORDER` (matches Swift's `EngineBridge.order`). Confirmed by reading `ios/Shared/EngineBridge.swift`'s real signatures against `src/engine/index.ts` directly — every method Calendar needs, another phase already needed too.

## Scope

**In scope**, matching the roadmap row ("4. Calendar — Month grid, phase borders, stats, plan progress"):
- Month grid with real logged-day fills, deload rings, and phase-boundary borders (zigzagging box around however many days a phase spans).
- Month navigation (prev/next), with the current pace shown next to the month title.
- Legend (no-session swatch, deload ring, one swatch per phase, the "projected" disclaimer).
- Plan progress bar (training days banked toward Performance, capped at 100%).
- All-time stats panel (sessions logged, consistency %, day streak, per-session-type breakdown with the climbHard→"Board" special case).
- `TrendForecast`: the rate-based projection of the next deload window, used for both future-day fill data and the month-title's pace caption.
- Presented as a modal route, replacing `card.tsx`'s current `onTapCalendar={() => {}}` no-op.

**Out of scope** (unchanged from every other phase's "no-op until built" precedent): nothing else on the daily card changes. Rehab-track calendar entries (if any exist later) are Phase 6's concern.

## Decision 1: route and presentation

New file `app/(main)/calendar.tsx`. Swift presents this as a `.sheet` (bottom-up modal, swipe-to-dismiss + explicit X). The direct expo-router equivalent is a modal-presented Stack screen: `app/(main)/_layout.tsx` (doesn't exist yet — `app/_layout.tsx` currently renders a bare `<Stack>` with no per-screen options) gets a `<Stack.Screen name="calendar" options={{ presentation: 'modal' }} />` entry. `card.tsx`'s `onTapCalendar` becomes `() => router.push('/calendar')` (expo-router's `useRouter()`), and the screen's own X button calls `router.back()` — both native-feeling equivalents of Swift's boolean-flag sheet toggle.

## Decision 2: Calendar owns its own data, independently of `card.tsx`

Swift's `CalendarView` receives `bridge`/`history` as constructor params from `NativeAppView`, which already holds them. RN's `card.tsx` also already holds `useSession()`/`useStore()`/the resolved `program`/`engine` — but a modal route pushed via expo-router is a separate screen instance, not a child component, so there's no direct prop path from `card.tsx` to `calendar.tsx`.

Two options: (a) lift session/store/program into a context provider at the app root so both screens share one instance, or (b) have `calendar.tsx` independently call `useSession()` + `useStore()` + resolve its own `program`/`engine`, the same handful of calls `card.tsx` already makes. (b) is simpler, has zero risk of the two screens' engine/store instances silently diverging in a shared-context bug, and matches this codebase's existing "each screen is independently data-sufficient" pattern (there is no shared data context anywhere in the app today). Chosen: **(b)**. The cost is a second `sessions`/`profiles` fetch when Calendar opens — cheap, and matches Swift's own re-render-from-fresh-props model closely enough (Swift's `history` is a snapshot passed at sheet-presentation time too, not a live binding).

## Decision 3: `PartialBorder` via `react-native-svg`

Already an installed dependency (since Task 1 of Phase 0-2, unused until now — like `expo-notifications` before Phase 3). Swift's `PartialBorder: Shape` draws 0-4 independent line segments (top/bottom/leading/trailing), each only when that side borders a different phase or the month edge. Direct RN port: an `<Svg>` per cell rendering up to 4 `<Line>` elements, sized `width+4`/`height+4` and centered, mirroring Swift's own "bleeds 2pt past this cell's bounds so adjacent borders meet mid-gap" comment exactly.

## Decision 4: month grid via manual flexbox rows, not a grid library

RN has no `LazyVGrid` equivalent and no grid library is installed. A 7-column week-row layout is simple enough to build directly: `daysInVisibleMonth()` returns `(string | null)[]` (ISO date strings or null for a leading/trailing blank), grouped into chunks of 7, each chunk a `flexDirection: 'row'` `View` of 7 equal-flex cells. No virtualization needed — a month is at most 6 rows × 7 cells = 42 cells, trivially cheap to render in full every time.

## Decision 5: pure-logic files, matching the established split

- `src/screens/calendar/calendarMath.ts` — `daysInVisibleMonth(visibleMonthISO, todayISO)`, `startOfMonth`, `shiftMonth`, `monthTitle` — direct ports of Swift's "Month math" section, using plain JS `Date` (UTC-safe date arithmetic, no timezone-sensitive `Calendar` object needed since these are pure calendar-day computations already normalized to `yyyy-MM-dd` strings elsewhere in this codebase, e.g. `engine.addDays`).
- `src/screens/calendar/trendForecast.ts` — direct port of Swift's `TrendForecast` struct + its `compute`/`weeklyRate` static methods. Pure, engine-parametrized (takes an `engine` object with `addDays`/`block`/`isTraining` — the same shape `createEngine()` already returns), directly unit-testable.
- `src/screens/calendar/allTimeStats.ts` — direct port of Swift's `computeAllTimeStats` (private static func) + the `AllTimeStats`/breakdown shape.
- `src/screens/calendar/planProgress.ts` — direct port of the `planProgress` computed property (small enough to be one function, but kept separate from `allTimeStats.ts` since Swift itself keeps it as an independent computed property, not part of `AllTimeStats`).

All four together mirror Swift's own "MARK: - Stats" / "MARK: - Month math" section boundaries — this phase doesn't invent new decomposition, it follows the one already in the source file.

## Decision 6: UI component structure

```
app/(main)/calendar.tsx          # screen: owns session/store/program/engine, renders CalendarScreen
src/screens/calendar/
├── calendarMath.ts               # pure (Decision 5)
├── trendForecast.ts              # pure (Decision 5)
├── allTimeStats.ts                # pure (Decision 5)
├── planProgress.ts                # pure (Decision 5)
├── CalendarScreen.tsx             # top-level layout: ScrollView + all sections, mirrors body's VStack
├── MonthGrid.tsx                  # weekday row + the 7-column day grid
├── DayCell.tsx                    # one cell: fill, deload ring, today outline, PartialBorder (react-native-svg)
├── PlanProgressBar.tsx
├── StatsPanel.tsx                 # the 3 stat tiles + breakdown grid
└── Legend.tsx
```

## Testing

- `calendarMath.ts`, `trendForecast.ts`, `allTimeStats.ts`, `planProgress.ts` get direct Jest tests (flat `test(...)`, no `describe`), same rigor as every other pure-logic port this project has done — these are the highest-value tests here since the streak/consistency/deload-window rules encode real, previously-reported bugs (e.g. "why does max strength not end", "deload only showed the 2 real days already logged, none of the week still ahead") that a naive re-implementation could easily reintroduce.
- UI components (`CalendarScreen.tsx`, `MonthGrid.tsx`, `DayCell.tsx`, etc.) are verified live on a real device, same as every Phase 2/3 UI component — no React Testing Library in this project.

## Risks

- **`react-native-svg` hasn't been used anywhere in this codebase yet** despite being installed since Task 1 — same category of risk as Phase 3's `expo-audio`/`expo-notifications` (installed-but-unproven dependencies). First implementation task should render one real `<Svg>`/`<Line>` and confirm it actually appears on a real device build before the rest of `DayCell.tsx` is built on top of it.
- **Date-arithmetic correctness**: Swift uses a real `Calendar` object with `firstWeekday = 2` (Monday) throughout month math; the RN port uses plain `Date`/string arithmetic. Every date computation must be verified against concrete known dates in tests (e.g. "1 August 2026 is a Saturday, so the grid's first row should have 5 leading blanks before it" — verifiable independently against a real calendar) rather than trusted by inspection alone, since off-by-one leading-blank bugs are the classic failure mode here.

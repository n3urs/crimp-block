import SwiftUI

/// History and forecast in one month-navigable calendar — reachable from
/// the calendar icon in the header, real signed-in accounts only (see
/// DailyCardView's onTapCalendar doc comment).
///
/// Past/today cells are ground truth: whatever NativeStore actually holds
/// for that date, coloured the same as the session's own accent everywhere
/// else in the app. Future cells are never invented — the only thing shown
/// beyond today is the SINGLE next predicted deload window and the SINGLE
/// next predicted phase change (if the next block happens to start a new
/// phase), both derived from real adherence, not from assuming every
/// recommended day gets trained. Extending this to show further-out
/// recurring predictions as you page forward is a natural next step, not
/// done here — one clear prediction beats a long row of increasingly
/// speculative ones.
struct CalendarView: View {
    let bridge: EngineBridge
    let history: [String: NativeStore.Entry]
    var onDismiss: () -> Void

    @State private var visibleMonth: Date
    @State private var forecast: TrendForecast?
    @State private var allTimeStats: AllTimeStats?

    private static let iso: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private static var calendar: Calendar = {
        var cal = Calendar(identifier: .gregorian)
        cal.firstWeekday = 2 // Monday, matching the app's en_GB date formatting elsewhere
        return cal
    }()

    init(bridge: EngineBridge, history: [String: NativeStore.Entry], onDismiss: @escaping () -> Void) {
        self.bridge = bridge
        self.history = history
        self.onDismiss = onDismiss
        let todayDate = Self.iso.date(from: bridge.today()) ?? Date()
        _visibleMonth = State(initialValue: Self.startOfMonth(todayDate))
    }

    var body: some View {
        // Tightened (18pt spacing down to 13, dropped the Rest row) to
        // actually fit on one screen with no scrolling on a real device —
        // confirmed live. Still wrapped in a ScrollView, not a fixed
        // VStack: that's a safety net for a Dynamic Type accessibility
        // size or a small device, where it degrades to a quiet scroll
        // instead of silently clipping the stats panel — invisible in
        // the normal case since the content already fits.
        ScrollView {
            VStack(alignment: .leading, spacing: 13) {
                topBar
                planProgressBar
                monthNav
                weekdayRow
                monthGrid
                legend
                statsPanel
            }
            .padding(20)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(SessionColours.bg)
        .onAppear {
            forecast = TrendForecast.compute(bridge: bridge, history: history)
            allTimeStats = Self.computeAllTimeStats(bridge: bridge, history: history)
        }
    }

    private var topBar: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text("CALENDAR")
                    .font(AppFonts.heading(26))
                    .foregroundStyle(.white)
                Spacer()
                Button(action: onDismiss) {
                    Image(systemName: "xmark")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(SessionColours.dim)
                }
                .buttonStyle(.plain)
            }
            // Where you actually are right now — same phase/block/week
            // language as the header pill on the daily card itself, just
            // not shown anywhere on this screen until now.
            if let line = currentPositionLine {
                Text(line)
                    .font(AppFonts.mono(11, weight: .bold))
                    .foregroundStyle(currentPhaseColour ?? SessionColours.dim)
            }
        }
    }

    private var currentPositionLine: String? {
        let today = bridge.today()
        guard let b = bridge.block(date: today), let phase = bridge.phaseNameAt(today) else { return nil }
        return "\(phase.uppercased()) · BLOCK \(b.b) · WK \(b.w) OF 4" + (b.w == 4 ? " · DELOAD" : "")
    }

    private var currentPhaseColour: Color? {
        guard let phase = bridge.phaseNameAt(bridge.today()), let varName = phaseColorByName[phase] else { return nil }
        return SessionColours.resolve(varName)
    }

    /// Phase name -> its own accent (program.phases[].c) — a SEPARATE
    /// palette from session-type accents, matching what phaseNameAt/
    /// phases already carry, just never surfaced on this screen before.
    private var phaseColorByName: [String: String] {
        Dictionary(uniqueKeysWithValues: bridge.phases.map { ($0.n, $0.c) })
    }

    /// Which phase a given day belongs to — real for past/today
    /// (phaseNameAt is accurate for any real date). A FUTURE date projects
    /// through however many blocks the trend rate implies between today
    /// and then, not just the next one: a phase spans several blocks
    /// (deloads land every block regardless of phase), and the calendar
    /// pages arbitrarily far forward, so stopping at the first transition
    /// left every later month stuck on that same "next" phase forever —
    /// real bug, reported directly ("why does max strength not end").
    /// Continuous block-length maths, not a day-by-day walk, since a
    /// block can span many calendar days at a slow pace.
    private func projectedPhaseName(daysAhead: Int) -> String? {
        let today = bridge.today()
        guard let b = bridge.block(date: today), let forecast, forecast.weeklyRate > 0 else {
            return bridge.phaseNameAt(today)
        }
        let calendarDaysPerTrainingDay = 7.0 / forecast.weeklyRate
        let trainingDaysAhead = Double(daysAhead) / calendarDaysPerTrainingDay
        let totalProjected = Double(b.total) + trainingDaysAhead
        let blockLength = Double(b.per * 4)
        guard blockLength > 0 else { return bridge.phaseNameAt(today) }
        let blocksAhead = Int((totalProjected / blockLength).rounded(.down))
        let projectedBlock = b.b + blocksAhead
        let idx = bridge.phaseIndexAt(block: projectedBlock)
        let phases = bridge.phases
        guard !phases.isEmpty else { return nil }
        return phases[min(max(idx, 0), phases.count - 1)].n
    }

    private var monthNav: some View {
        HStack {
            Button(action: { shiftMonth(-1) }) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(SessionColours.dim)
                    .frame(width: 32, height: 32)
                    .background(SessionColours.s1)
                    .clipShape(Circle())
            }
            .buttonStyle(.plain)
            Spacer()
            VStack(spacing: 2) {
                Text(monthTitle)
                    .font(AppFonts.mono(13, weight: .bold))
                    .foregroundStyle(.white)
                if let forecast {
                    Text("~\(forecast.weeklyRate, specifier: "%.1f") sessions / wk · last \(forecast.windowDays)d")
                        .font(AppFonts.mono(9.5, weight: .medium))
                        .foregroundStyle(SessionColours.faint)
                }
            }
            Spacer()
            Button(action: { shiftMonth(1) }) {
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(SessionColours.dim)
                    .frame(width: 32, height: 32)
                    .background(SessionColours.s1)
                    .clipShape(Circle())
            }
            .buttonStyle(.plain)
        }
    }

    private var weekdayRow: some View {
        // Indices as identity, not the letters themselves — Tue/Thu and
        // Sat/Sun share a letter, so `id: \.self` on the plain strings gave
        // SwiftUI two cells with the same identity twice over ("the ID T
        // occurs multiple times... undefined results", confirmed straight
        // from a real Xcode console). Harmless-looking today only because
        // this row never reorders or animates; still a real identity bug,
        // not just log noise, so worth fixing rather than living with it.
        HStack(spacing: 0) {
            ForEach(Array(["M", "T", "W", "T", "F", "S", "S"].enumerated()), id: \.offset) { _, d in
                Text(d)
                    .font(AppFonts.mono(10, weight: .medium))
                    .foregroundStyle(SessionColours.faint)
                    .frame(maxWidth: .infinity)
            }
        }
    }

    private var monthGrid: some View {
        // Computed once per grid, not per cell: every cell needs to know
        // its UP/DOWN/LEFT/RIGHT neighbours' phases to decide which of its
        // own 4 sides sit on a phase boundary, so the whole month's phases
        // are resolved up front into one flat array (same index scheme as
        // `days`) rather than each cell re-deriving its neighbours' phases
        // independently.
        let days = daysInVisibleMonth()
        let today = bridge.today()
        let todayDate = Self.iso.date(from: today)
        let phases: [String?] = days.map { date in
            guard let date else { return nil }
            let dateStr = Self.iso.string(from: date)
            if dateStr <= today { return bridge.phaseNameAt(dateStr) }
            guard let todayDate else { return bridge.phaseNameAt(today) }
            let daysAhead = Self.calendar.dateComponents([.day], from: todayDate, to: date).day ?? 0
            return projectedPhaseName(daysAhead: daysAhead)
        }
        let columns = Array(repeating: GridItem(.flexible(), spacing: 4), count: 7)
        return LazyVGrid(columns: columns, spacing: 4) {
            ForEach(Array(days.indices), id: \.self) { i in
                if let date = days[i] {
                    dayCell(date, index: i, phases: phases)
                } else {
                    Color.clear.frame(height: 38)
                }
            }
        }
    }

    @ViewBuilder
    private func dayCell(_ date: Date, index: Int, phases: [String?]) -> some View {
        let dateStr = Self.iso.string(from: date)
        let today = bridge.today()
        let isToday = dateStr == today
        let dayNum = Self.calendar.component(.day, from: date)
        let isPast = dateStr <= today
        let loggedColour = isPast ? history[dateStr].map { SessionColours.resolve(bridge.sessionColourVarName($0.t)) } : nil
        // Real for past/today — bridge.isDeload(date) is block(date).w==4,
        // exactly what the top bar's own "· DELOAD" suffix already reads
        // (see currentPositionLine above) — accurate for any real date the
        // same way phaseNameAt already is. Only genuinely future dates fall
        // back to the trend forecast's predicted window. Previously this
        // was future-only on the assumption that "real logged days already
        // speak for the present" — they don't: the logged fill colours by
        // SESSION TYPE, not by deload status, so a currently-active real
        // deload week never showed any deload signal at all. Reported
        // directly: "I'm currently on a deload week but it's not showing
        // up on the calendar."
        let isDeloadWindow = isPast
            ? bridge.isDeload(dateStr)
            : forecast?.deload.map { dateStr >= $0.start && dateStr <= $0.end } == true

        // Which of this cell's 4 sides border a DIFFERENT phase (or the
        // edge of the visible month, which counts the same — the box
        // simply starts fresh on the next page rather than trying to
        // connect across a month break). col/row neighbours are read
        // straight from the flat `phases` array, never wrapped across
        // rows (index-1 at column 0 would silently mean "last cell of the
        // row above", not "no neighbour" — the col checks guard that).
        let myPhase = phases[index]
        let col = index % 7
        let sameUp = index - 7 >= 0 && phases[index - 7] == myPhase
        let sameDown = index + 7 < phases.count && phases[index + 7] == myPhase
        let sameLeft = col > 0 && phases[index - 1] == myPhase
        let sameRight = col < 6 && phases[index + 1] == myPhase
        let phaseColour = myPhase.flatMap { phaseColorByName[$0] }.map { SessionColours.resolve($0) }

        ZStack {
            RoundedRectangle(cornerRadius: 8)
                .fill(loggedColour?.opacity(0.85) ?? (isPast ? SessionColours.s2 : SessionColours.s1))
            // A deload day is a RING, layered over whatever fill the cell
            // already has (a real session's colour, or plain "no session")
            // — it marks "this day is/was in a deload week" independently
            // of what, if anything, got logged that day. Red, not the
            // deload week's own phase colour — Max Strength's box is
            // already gold, close enough to the old amber ring that a
            // deload landing inside it read as invisible/confusing.
            if isDeloadWindow {
                Circle()
                    .strokeBorder(SessionColours.restC, lineWidth: 2)
                    .padding(6)
            }
            Text("\(dayNum)")
                .font(AppFonts.mono(11, weight: isToday ? .bold : .medium))
                .foregroundStyle(loggedColour != nil ? SessionColours.bg : SessionColours.fg.opacity(isDeloadWindow ? 1 : 0.55))
        }
        .frame(height: 38)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(isToday ? SessionColours.fg : .clear, lineWidth: 1.5)
        )
        // The phase boundary — one continuous-looking box (zigzagging to
        // fit however many days the phase actually spans) around every
        // cell that shares this day's phase, not a per-day dot. Direct
        // feedback: the dots were too subtle to notice; a literal outline
        // around the whole phase reads instantly. Bleeds 2pt past this
        // cell's own bounds on every bordered side — half the grid's 4pt
        // inter-cell spacing — so two neighbouring cells' border segments
        // meet in the middle of the gap instead of leaving a visible break
        // at every seam.
        .overlay(
            GeometryReader { geo in
                if let phaseColour {
                    PartialBorder(top: !sameUp, bottom: !sameDown, leading: !sameLeft, trailing: !sameRight)
                        .stroke(phaseColour, lineWidth: 2.5)
                        .frame(width: geo.size.width + 4, height: geo.size.height + 4)
                        .position(x: geo.size.width / 2, y: geo.size.height / 2)
                }
            }
        )
    }

    private var legend: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 14) {
                legendItem(colour: SessionColours.s2, label: "No session")
                HStack(spacing: 6) {
                    Circle().strokeBorder(SessionColours.restC, lineWidth: 2).frame(width: 12, height: 12)
                    Text("Deload week")
                        .font(AppFonts.mono(10, weight: .medium))
                        .foregroundStyle(SessionColours.faint)
                }
            }
            if let dl = forecast?.deload {
                let isOngoing = bridge.block(date: bridge.today())?.w == 4
                Text(isOngoing
                    ? "This deload runs to \(Self.displayDate(dl.end)), at your pace"
                    : "Next deload, at your pace: \(Self.displayDate(dl.start)) – \(Self.displayDate(dl.end))")
                    .font(AppFonts.mono(10.5, weight: .medium))
                    .foregroundStyle(SessionColours.dim)
            }
            if !bridge.phases.isEmpty {
                HStack(spacing: 14) {
                    ForEach(bridge.phases) { phase in
                        HStack(spacing: 6) {
                            RoundedRectangle(cornerRadius: 2)
                                .strokeBorder(SessionColours.resolve(phase.c), lineWidth: 2)
                                .frame(width: 10, height: 10)
                            Text(phase.n.uppercased())
                                .font(AppFonts.mono(10, weight: .medium))
                                .foregroundStyle(SessionColours.faint)
                        }
                    }
                }
                .padding(.top, 2)
                // The box outline itself shows WHERE a future phase starts —
                // this just says plainly that anything past today is a
                // projection, not a confirmed plan, now that the one
                // explicit "predicted start of X — date" line is gone
                // (redundant with the outline, and it only ever named the
                // FIRST upcoming phase — pointless once boxes past today
                // project through as many phases as the pace implies).
                Text("Phases past today are projected from your current pace, not confirmed.")
                    .font(AppFonts.mono(9.5, weight: .medium))
                    .foregroundStyle(SessionColours.faint)
                    .padding(.top, 2)
            }
        }
        .padding(.top, 4)
    }

    private func legendItem(colour: Color, label: String) -> some View {
        HStack(spacing: 6) {
            RoundedRectangle(cornerRadius: 3).fill(colour).frame(width: 12, height: 12)
            Text(label)
                .font(AppFonts.mono(10, weight: .medium))
                .foregroundStyle(SessionColours.faint)
        }
    }

    // MARK: - Stats

    /// Every number in the stats panel — all-time, none of it scoped to
    /// `visibleMonth`. Direct feedback: "i want all the stats to be all
    /// time stats not just the streak and consistancy so when u go to
    /// other months it shows how many climbs and stuff ever". Computed
    /// once in onAppear (see body) and cached, same "fixed regardless of
    /// which page you're on" treatment `forecast` already has — a plain
    /// computed property would silently look month-scoped again the
    /// moment anything in it referenced `visibleMonth`.
    private struct AllTimeStats {
        let loggedCount: Int
        let consistencyPercent: Int?
        let consistencyFraction: String?
        let streak: Int
        let breakdown: [(key: String, name: String, colour: Color, count: Int)]
    }

    private static func computeAllTimeStats(bridge: EngineBridge, history: [String: NativeStore.Entry]) -> AllTimeStats {
        let today = bridge.today()

        // loggedCount/breakdown walk EVERY real entry in history, bounded
        // only by "not the future" — deliberately NOT bounded at
        // programStartDate the way consistency/streak below have to be.
        // "How many climbs ever" is a literal count of what was actually
        // logged; a real session 3 days before the program's official
        // start is still a real session, even though block()'s own
        // internal counting (which consistency/streak both have to match)
        // never counts it.
        var loggedCount = 0
        var counts: [String: Int] = [:]
        // Board gets its own count rather than joining `counts`' single-
        // key-per-type shape — see the breakdown-construction comment
        // below for why climbHard becomes just this one row.
        var boardCount = 0
        for (date, entry) in history where date <= today {
            counts[entry.t, default: 0] += 1
            if entry.t != "rest" { loggedCount += 1 }
            if entry.t == "climbHard" && entry.sub == "board" { boardCount += 1 }
        }

        // EngineBridge.order, not sorted by count — matches the fixed
        // session order used everywhere else in the app (swipe order,
        // week dots). Rest excluded — it isn't a "workout" and Oscar
        // doesn't want it cluttering the breakdown. climbHard becomes a
        // single "Board" row rather than its own generic name — direct
        // feedback: he wants this stat to mean board sessions
        // specifically, not climbHard as a whole. A climbHard day NOT
        // characterised as a board session (logged as "just a hard
        // climb", or from before that choice existed) isn't counted
        // toward it — it still counts toward SESSIONS LOGGED above and
        // still colours its day on the grid, it just isn't a board
        // session. Unlike every other row here, Board always shows, even
        // at zero — hiding it entirely at 0 read as the feature not
        // working rather than an honest "you haven't tagged one yet".
        var breakdown: [(key: String, name: String, colour: Color, count: Int)] = []
        for key in EngineBridge.order {
            guard key != "rest" else { continue }
            if key == "climbHard" {
                breakdown.append((key: "climbHard-board", name: "Board",
                                   colour: SessionColours.resolve(bridge.sessionColourVarName(key)), count: boardCount))
                continue
            }
            guard let n = counts[key], n > 0 else { continue }
            breakdown.append((key: key, name: bridge.sessionInfo(key)?.name ?? key,
                               colour: SessionColours.resolve(bridge.sessionColourVarName(key)), count: n))
        }

        // Consistency: Actual = block(today).total — training days banked
        // since program start, the exact same count block() itself
        // already uses for phase/deload progression, so this can never
        // quietly drift from what the rest of the app considers
        // "trained". Expected = the program's own per-week target scaled
        // by calendar days elapsed since program start (programStartDate(),
        // NOT the earliest logged entry — those can genuinely differ, and
        // block().total is already counted from the real start date, so
        // the denominator has to match that exact same window or the
        // percentage would be measuring two different periods against
        // each other).
        var consistencyPercent: Int? = nil
        var consistencyFraction: String? = nil
        let startDate = bridge.programStartDate()
        if let b = bridge.block(date: today), b.per > 0, let startDate,
           let startDateObj = iso.date(from: startDate), let todayObj = iso.date(from: today) {
            let daysElapsed = (calendar.dateComponents([.day], from: startDateObj, to: todayObj).day ?? 0) + 1
            let expected = max(1, Int((Double(b.per) * Double(daysElapsed) / 7.0).rounded()))
            consistencyPercent = Int((Double(b.total) / Double(expected) * 100).rounded())
            consistencyFraction = "\(b.total)/\(expected)"
        }

        // Streak: consecutive days with SOMETHING logged, walking back
        // from today — rest counts (logging rest is still showing up).
        // Today gets a pass regardless of what's recommended — the day
        // isn't over yet, so not having logged it yet doesn't
        // retroactively break an in-progress streak. Every earlier day
        // follows the real rule: a missing day only breaks the streak if
        // something was actually due — direct feedback: "if you dont log
        // something but its meant to be a rest day anyway the streak will
        // continue, but if... its supposed to be a workout day then u
        // loose the streak". decide(date) is accurate for any real past
        // date the same way isDeload/phaseNameAt already are — it's a
        // pure function of the trailing logged history. Bounded at
        // programStartDate so this can't wander back into pre-account
        // history and count it as an unbroken streak of correctly skipped
        // rest days that were never really rest days at all.
        var streak = 0
        var d = today
        if history[d] == nil { d = bridge.addDays(d, -1) }
        while true {
            if let startDate, d < startDate { break }
            if history[d] != nil {
                streak += 1
            } else if bridge.decide(date: d)?.k == "rest" {
                streak += 1
            } else {
                break
            }
            d = bridge.addDays(d, -1)
            if streak > 3650 { break } // sane backstop, not a real limit
        }

        return AllTimeStats(loggedCount: loggedCount, consistencyPercent: consistencyPercent,
                             consistencyFraction: consistencyFraction, streak: streak, breakdown: breakdown)
    }

    /// Progress through the STRUCTURED plan — Base, Max Strength, Power —
    /// ending at the block Performance starts, not the plan's nominal last
    /// block. Performance itself has no finish line of its own to
    /// progress toward: it's open-ended "climb and maintain", not a phase
    /// with a further endpoint (see its own `d`escription in programs.js:
    /// "climbing takes over... this is when the previous five months are
    /// supposed to show up on rock"). Measured the same way consistency
    /// is — real training days banked (block(today).total) against
    /// however many the blocks before Performance need in total — so it
    /// can never drift from what the rest of the app already considers
    /// "trained". Capped at 100% for an account already past that point.
    /// A plain computed property, not cached — phases is a lightweight
    /// Swift array and this is one block() call, not a loop over history.
    private var planProgress: (percent: Int, current: Int, total: Int)? {
        guard let performanceFrom = bridge.phases.first(where: { $0.n == "Performance" })?.from,
              performanceFrom > 1,
              let b = bridge.block(date: bridge.today()) else { return nil }
        let totalNeeded = (performanceFrom - 1) * b.per * 4
        guard totalNeeded > 0 else { return nil }
        let percent = min(100, Int((Double(b.total) / Double(totalNeeded) * 100).rounded()))
        return (percent, b.total, totalNeeded)
    }

    private var planProgressBar: some View {
        Group {
            if let progress = planProgress {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("PLAN PROGRESS")
                            .font(AppFonts.mono(9.5, weight: .medium))
                            .foregroundStyle(SessionColours.faint)
                        Spacer()
                        Text("\(progress.percent)%")
                            .font(AppFonts.mono(13, weight: .bold))
                            .foregroundStyle(.white)
                    }
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            RoundedRectangle(cornerRadius: 4)
                                .fill(SessionColours.s2)
                            RoundedRectangle(cornerRadius: 4)
                                .fill(currentPhaseColour ?? SessionColours.resolve("--gorse"))
                                .frame(width: max(6, geo.size.width * CGFloat(progress.percent) / 100))
                        }
                    }
                    .frame(height: 8)
                    Text("\(progress.current)/\(progress.total) training days to Performance")
                        .font(AppFonts.mono(9, weight: .medium))
                        .foregroundStyle(SessionColours.faint)
                }
            }
        }
    }

    private var statsPanel: some View {
        let stats = allTimeStats
        return VStack(alignment: .leading, spacing: 10) {
            Rectangle().fill(SessionColours.s2).frame(height: 1)
            Text("STATS")
                .font(AppFonts.mono(11, weight: .bold))
                .foregroundStyle(SessionColours.faint)

            HStack(alignment: .top, spacing: 0) {
                statTile(value: stats.map { "\($0.loggedCount)" } ?? "—", label: "SESSIONS LOGGED")
                statTile(
                    value: stats?.consistencyPercent.map { "\($0)%" } ?? "—",
                    label: stats?.consistencyFraction.map { "CONSISTENCY · \($0)" } ?? "CONSISTENCY"
                )
                statTile(value: stats.map { "\($0.streak)" } ?? "—", label: "DAY STREAK")
            }

            // Two columns, and the count sits right next to its own name
            // instead of pushed to the far edge of a full-width row —
            // direct feedback: with the count over on the right, the eye
            // has to travel all the way across to match a row to its
            // number. One compact "NAME · COUNT" block fixes that AND
            // roughly halves the vertical space this takes, which matters
            // now that the whole screen has to fit with no scrolling.
            if let stats, !stats.breakdown.isEmpty {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)],
                          alignment: .leading, spacing: 6) {
                    ForEach(stats.breakdown, id: \.key) { row in
                        HStack(spacing: 6) {
                            RoundedRectangle(cornerRadius: 2).fill(row.colour).frame(width: 8, height: 8)
                            Text("\(row.name.uppercased()) · \(row.count)")
                                .font(AppFonts.mono(10, weight: .medium))
                                .foregroundStyle(SessionColours.dim)
                                .lineLimit(1)
                                .minimumScaleFactor(0.85)
                        }
                    }
                }
                .padding(.top, 2)
            }
        }
    }

    private func statTile(value: String, label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(AppFonts.heading(22))
                .foregroundStyle(.white)
            Text(label)
                .font(AppFonts.mono(8.5, weight: .medium))
                .foregroundStyle(SessionColours.faint)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Month math (native Calendar, no JS round-trips per cell)

    private var monthTitle: String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_GB")
        f.dateFormat = "MMMM yyyy"
        return f.string(from: visibleMonth).uppercased()
    }

    private func shiftMonth(_ delta: Int) {
        if let d = Self.calendar.date(byAdding: .month, value: delta, to: visibleMonth) {
            visibleMonth = Self.startOfMonth(d)
        }
    }

    private static func startOfMonth(_ date: Date) -> Date {
        let comps = calendar.dateComponents([.year, .month], from: date)
        return calendar.date(from: comps) ?? date
    }

    private func daysInVisibleMonth() -> [Date?] {
        let cal = Self.calendar
        guard let range = cal.range(of: .day, in: .month, for: visibleMonth) else { return [] }
        let firstWeekday = cal.component(.weekday, from: visibleMonth) // 1=Sun...7=Sat
        let leadingBlanks = (firstWeekday - cal.firstWeekday + 7) % 7
        var days: [Date?] = Array(repeating: nil, count: leadingBlanks)
        for d in 0..<range.count {
            days.append(cal.date(byAdding: .day, value: d, to: visibleMonth))
        }
        while days.count % 7 != 0 { days.append(nil) }
        return days
    }

    private static func displayDate(_ dateStr: String) -> String {
        guard let d = iso.date(from: dateStr) else { return dateStr }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_GB")
        f.dateFormat = "d MMM"
        return f.string(from: d)
    }
}

/// Strokes only the requested sides of its rect, each as its own line
/// segment (not one continuous rounded path) — used per day cell so a
/// whole phase's date range reads as one zigzagging box: a cell draws a
/// border only on the sides that face a DIFFERENT phase (or the edge of
/// the visible month), so adjacent same-phase cells share an invisible
/// seam and the outline naturally traces the actual boundary of however
/// many days the phase spans.
private struct PartialBorder: Shape {
    var top: Bool
    var bottom: Bool
    var leading: Bool
    var trailing: Bool

    func path(in rect: CGRect) -> Path {
        var p = Path()
        if top {
            p.move(to: CGPoint(x: rect.minX, y: rect.minY))
            p.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        }
        if bottom {
            p.move(to: CGPoint(x: rect.minX, y: rect.maxY))
            p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        }
        if leading {
            p.move(to: CGPoint(x: rect.minX, y: rect.minY))
            p.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        }
        if trailing {
            p.move(to: CGPoint(x: rect.maxX, y: rect.minY))
            p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        }
        return p
    }
}

/// A trend-based projection, not a plan-following one: `nativeForecast()`
/// elsewhere in the app already answers "what would happen if every
/// recommended day gets trained" — this instead asks "at the rate you've
/// ACTUALLY been training, when will the next deload/phase change really
/// land". Both are legitimate answers to different questions; this is the
/// one for a calendar looking realistically into the future.
struct TrendForecast {
    struct Deload { let start: String; let end: String }

    let weeklyRate: Double
    let windowDays: Int
    let deload: Deload?

    /// Training days per calendar day, measured over the last `windowDays`
    /// (falling back to however much real history exists if less) —
    /// recency-weighted on purpose: a rolling window reflects how someone
    /// is training NOW, not diluted by a strong first month or a slow
    /// comeback from injury years back. isTraining() mirrors block()'s own
    /// definition exactly (finger or pull load > 0), so this rate measures
    /// precisely what block() counts toward a training week — the two
    /// can't quietly drift apart.
    ///
    /// Bounded by the EARLIEST real entry in history, not just `windowDays`
    /// back from today: a fixed 56-day lookback on an account only 2-3
    /// weeks old (or a sparse sample-data seed) walked back through weeks
    /// of "nothing logged" that predate the account existing at all —
    /// counted identically to a real gap in training, which crushed the
    /// rate toward zero and threw the projected dates a season out. Real
    /// bug, not a sample-data artifact: a brand new Deadpoint account hits
    /// this on day one. Returns the ACTUAL number of days the rate was
    /// measured over, since it's often less than `windowDays` — the UI
    /// caption says so rather than always claiming the full window.
    private static func weeklyRate(bridge: EngineBridge, history: [String: NativeStore.Entry], today: String, windowDays: Int) -> (rate: Double, actualDays: Int) {
        let earliest = history.keys.min() ?? today
        let requestedStart = bridge.addDays(today, -windowDays)
        let start = max(requestedStart, earliest) // ISO yyyy-MM-dd strings sort chronologically
        var trainingCount = 0
        var calendarCount = 0
        var d = start
        while d <= today {
            calendarCount += 1
            if let entry = history[d], bridge.isTraining(entry.t) { trainingCount += 1 }
            d = bridge.addDays(d, 1)
        }
        guard calendarCount > 0 else { return (4, 0) }
        // Floored, not left at zero: a genuine 0/window (e.g. a brand-new
        // account, or a long injury layoff) would otherwise divide the
        // projection by zero and produce a nonsense date far in the past
        // relative to today rather than just a very distant one.
        let daily = max(Double(trainingCount) / Double(calendarCount), 1.0 / 30.0)
        return (daily * 7, calendarCount)
    }

    static func compute(bridge: EngineBridge, history: [String: NativeStore.Entry]) -> TrendForecast {
        let today = bridge.today()
        let (weekly, actualWindowDays) = weeklyRate(bridge: bridge, history: history, today: today, windowDays: 56)
        let windowDays = actualWindowDays
        let calendarDaysPerTrainingDay = 7.0 / weekly

        guard let b = bridge.block(date: today) else {
            return TrendForecast(weeklyRate: weekly, windowDays: windowDays, deload: nil)
        }

        // Deload is week 4 of every block. This split matters and is not
        // symmetric: mid-deload right now (w == 4) needs the days LEFT in
        // THIS week, not the next one three weeks out. block() freezes at
        // today's real progress for every future date (no new logged days
        // to advance it), so raw isDeload() would ring every future day
        // forever if reused past today — real bug, reported directly
        // (deload only showed the 2 real days already logged, none of the
        // week still ahead). Projecting the remaining training days this
        // week needs, the same rate-based way the "next" branch already
        // projects a whole window, fixes that without ringing indefinitely.
        let deload: Deload?
        if b.w == 4 {
            let remainingTrainingDays = max(0, b.per - b.done)
            let endOffset = max(1, Int((Double(remainingTrainingDays) * calendarDaysPerTrainingDay).rounded()))
            deload = Deload(start: today, end: bridge.addDays(today, endOffset))
        } else {
            let trainingDaysToDeload = max(0, b.per * 3 - b.total)
            let deloadStartOffset = Int((Double(trainingDaysToDeload) * calendarDaysPerTrainingDay).rounded())
            let deloadLengthOffset = max(1, Int((Double(b.per) * calendarDaysPerTrainingDay).rounded()))
            let deloadStart = bridge.addDays(today, deloadStartOffset)
            let deloadEnd = bridge.addDays(deloadStart, deloadLengthOffset)
            // Only worth showing once it's genuinely ahead of today, not a
            // deload that (per this projection) should already be under way.
            deload = deloadStartOffset > 0 ? Deload(start: deloadStart, end: deloadEnd) : nil
        }

        return TrendForecast(weeklyRate: weekly, windowDays: windowDays, deload: deload)
    }
}

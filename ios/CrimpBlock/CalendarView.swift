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
        VStack(alignment: .leading, spacing: 18) {
            topBar
            monthNav
            weekdayRow
            monthGrid
            legend
            Spacer(minLength: 0)
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(SessionColours.bg)
        .onAppear {
            forecast = TrendForecast.compute(bridge: bridge, history: history)
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
        HStack(spacing: 0) {
            ForEach(["M", "T", "W", "T", "F", "S", "S"], id: \.self) { d in
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
                Text("Next deload, at your pace: \(Self.displayDate(dl.start)) – \(Self.displayDate(dl.end))")
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

        // Deload is week 4 of every block. Mid-deload right now (w == 4)?
        // Then "next" means the one after THIS block finishes, not the one
        // already under way (which is already visible as real logged days).
        let trainingDaysToDeload = b.w < 4
            ? max(0, b.per * 3 - b.total)
            : max(0, b.per * 7 - b.total)

        let deloadStartOffset = Int((Double(trainingDaysToDeload) * calendarDaysPerTrainingDay).rounded())
        let deloadLengthOffset = max(1, Int((Double(b.per) * calendarDaysPerTrainingDay).rounded()))
        let deloadStart = bridge.addDays(today, deloadStartOffset)
        let deloadEnd = bridge.addDays(deloadStart, deloadLengthOffset)
        // Only worth showing once it's genuinely ahead of today, not a
        // deload that (per this projection) should already be under way —
        // real logged days already speak for the present.
        let deload: Deload? = deloadStartOffset > 0 ? Deload(start: deloadStart, end: deloadEnd) : nil

        return TrendForecast(weeklyRate: weekly, windowDays: windowDays, deload: deload)
    }
}

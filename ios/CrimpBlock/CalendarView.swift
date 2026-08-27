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
        let columns = Array(repeating: GridItem(.flexible(), spacing: 4), count: 7)
        return LazyVGrid(columns: columns, spacing: 4) {
            ForEach(Array(daysInVisibleMonth().enumerated()), id: \.offset) { _, date in
                if let date {
                    dayCell(date)
                } else {
                    Color.clear.frame(height: 38)
                }
            }
        }
    }

    @ViewBuilder
    private func dayCell(_ date: Date) -> some View {
        let dateStr = Self.iso.string(from: date)
        let today = bridge.today()
        let isToday = dateStr == today
        let dayNum = Self.calendar.component(.day, from: date)
        // Independent checks, not a single either/or state — a day can be
        // BOTH inside the predicted deload window AND the exact predicted
        // phase-change date (the real, common case: a phase change always
        // lands right at a block boundary, and the deload window is the
        // tail end of the block before it). An earlier either/or enum
        // picked deload first and the phase-change marker never showed
        // when the two coincided — this renders both independently instead.
        let isPast = dateStr <= today
        let loggedColour = isPast ? history[dateStr].map { SessionColours.resolve(bridge.sessionColourVarName($0.t)) } : nil
        let isDeloadWindow = !isPast && forecast?.deload.map { dateStr >= $0.start && dateStr <= $0.end } == true
        let isPhaseChangeDay = !isPast && forecast?.phaseChange?.date == dateStr

        let isNotable = isDeloadWindow || isPhaseChangeDay

        ZStack {
            RoundedRectangle(cornerRadius: 8)
                .fill(loggedColour?.opacity(0.85) ?? (isPast ? SessionColours.s2 : SessionColours.s1))
            // A future deload day is a RING, not a filled wash — same visual
            // language as the session dots' own "recommended" ring
            // elsewhere in the app (an outline marks something coming up,
            // a fill marks something that's actually happened). Direct
            // feedback: a solid colour block read as "this already
            // happened", which a prediction never should.
            if isDeloadWindow {
                Circle()
                    .strokeBorder(SessionColours.readyC, lineWidth: 2)
                    .padding(6)
            }
            if isPhaseChangeDay {
                RoundedRectangle(cornerRadius: 8)
                    .strokeBorder(style: StrokeStyle(lineWidth: 1.5, dash: [3, 2]))
                    .foregroundStyle(SessionColours.fg)
            }
            Text("\(dayNum)")
                .font(AppFonts.mono(11, weight: isToday ? .bold : .medium))
                .foregroundStyle(loggedColour != nil ? SessionColours.bg : SessionColours.fg.opacity(isNotable ? 1 : 0.55))
        }
        .frame(height: 38)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(isToday ? SessionColours.fg : .clear, lineWidth: 1.5)
        )
    }

    private var legend: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 14) {
                legendItem(colour: SessionColours.s2, label: "No session")
                HStack(spacing: 6) {
                    Circle().strokeBorder(SessionColours.readyC, lineWidth: 2).frame(width: 12, height: 12)
                    Text("Predicted deload")
                        .font(AppFonts.mono(10, weight: .medium))
                        .foregroundStyle(SessionColours.faint)
                }
            }
            if let pc = forecast?.phaseChange {
                HStack(spacing: 8) {
                    RoundedRectangle(cornerRadius: 4)
                        .strokeBorder(style: StrokeStyle(lineWidth: 1.5, dash: [3, 2]))
                        .foregroundStyle(SessionColours.fg)
                        .frame(width: 14, height: 14)
                    Text("Predicted start of \(pc.phaseName.uppercased()) — \(Self.displayDate(pc.date))")
                        .font(AppFonts.mono(10.5, weight: .medium))
                        .foregroundStyle(SessionColours.dim)
                }
            }
            if let dl = forecast?.deload {
                Text("Next deload, at your pace: \(Self.displayDate(dl.start)) – \(Self.displayDate(dl.end))")
                    .font(AppFonts.mono(10.5, weight: .medium))
                    .foregroundStyle(SessionColours.dim)
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

/// A trend-based projection, not a plan-following one: `nativeForecast()`
/// elsewhere in the app already answers "what would happen if every
/// recommended day gets trained" — this instead asks "at the rate you've
/// ACTUALLY been training, when will the next deload/phase change really
/// land". Both are legitimate answers to different questions; this is the
/// one for a calendar looking realistically into the future.
struct TrendForecast {
    struct Deload { let start: String; let end: String }
    struct PhaseChange { let date: String; let phaseName: String }

    let weeklyRate: Double
    let windowDays: Int
    let deload: Deload?
    let phaseChange: PhaseChange?

    /// Training days per calendar day, measured over the last `windowDays`
    /// (falling back to however much real history exists if less) —
    /// recency-weighted on purpose: a rolling window reflects how someone
    /// is training NOW, not diluted by a strong first month or a slow
    /// comeback from injury years back. isTraining() mirrors block()'s own
    /// definition exactly (finger or pull load > 0), so this rate measures
    /// precisely what block() counts toward a training week — the two
    /// can't quietly drift apart.
    private static func weeklyRate(bridge: EngineBridge, history: [String: NativeStore.Entry], today: String, windowDays: Int) -> Double {
        let start = bridge.addDays(today, -windowDays)
        var trainingCount = 0
        var calendarCount = 0
        var d = start
        while d <= today {
            calendarCount += 1
            if let entry = history[d], bridge.isTraining(entry.t) { trainingCount += 1 }
            d = bridge.addDays(d, 1)
        }
        guard calendarCount > 0 else { return 4 }
        // Floored, not left at zero: a genuine 0/window (e.g. a brand-new
        // account, or a long injury layoff) would otherwise divide the
        // projection by zero and produce a nonsense date far in the past
        // relative to today rather than just a very distant one.
        let daily = max(Double(trainingCount) / Double(calendarCount), 1.0 / 30.0)
        return daily * 7
    }

    static func compute(bridge: EngineBridge, history: [String: NativeStore.Entry]) -> TrendForecast {
        let today = bridge.today()
        let windowDays = 56
        let weekly = weeklyRate(bridge: bridge, history: history, today: today, windowDays: windowDays)
        let calendarDaysPerTrainingDay = 7.0 / weekly

        guard let b = bridge.block(date: today) else {
            return TrendForecast(weeklyRate: weekly, windowDays: windowDays, deload: nil, phaseChange: nil)
        }

        // Deload is week 4 of every block. Mid-deload right now (w == 4)?
        // Then "next" means the one after THIS block finishes, not the one
        // already under way (which is already visible as real logged days).
        let trainingDaysToDeload = b.w < 4
            ? max(0, b.per * 3 - b.total)
            : max(0, b.per * 7 - b.total)
        let trainingDaysToNextBlock = max(0, b.per * 4 - b.total)

        let deloadStartOffset = Int((Double(trainingDaysToDeload) * calendarDaysPerTrainingDay).rounded())
        let deloadLengthOffset = max(1, Int((Double(b.per) * calendarDaysPerTrainingDay).rounded()))
        let deloadStart = bridge.addDays(today, deloadStartOffset)
        let deloadEnd = bridge.addDays(deloadStart, deloadLengthOffset)
        // Only worth showing once it's genuinely ahead of today, not a
        // deload that (per this projection) should already be under way —
        // real logged days already speak for the present.
        let deload: Deload? = deloadStartOffset > 0 ? Deload(start: deloadStart, end: deloadEnd) : nil

        var phaseChange: PhaseChange? = nil
        let phases = bridge.phases
        let currentPhaseIdx = bridge.phaseIndexAt(block: b.b)
        let nextPhaseIdx = bridge.phaseIndexAt(block: b.b + 1)
        if currentPhaseIdx != nextPhaseIdx, nextPhaseIdx < phases.count {
            let nextBlockOffset = Int((Double(trainingDaysToNextBlock) * calendarDaysPerTrainingDay).rounded())
            let nextBlockStart = bridge.addDays(today, nextBlockOffset)
            phaseChange = PhaseChange(date: nextBlockStart, phaseName: phases[nextPhaseIdx].n)
        }

        return TrendForecast(weeklyRate: weekly, windowDays: windowDays, deload: deload, phaseChange: phaseChange)
    }
}

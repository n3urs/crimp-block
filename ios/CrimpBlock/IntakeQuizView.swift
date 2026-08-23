import SwiftUI

/// Standard-tier onboarding: a short quiz that assigns a new user to one of
/// the 6 template cells (templates.js) plus a modifier set, per the
/// commercial-relaunch plan's Phase C. Deliberately short — one question
/// per screen, skippable where the plan calls for it (weakness, equipment,
/// injury, trip date are all optional; only discipline, experience level,
/// and days/week are required) — matching the same "simple, not
/// overwhelming" standard the daily card already holds itself to.
///
/// Phase C.1 addition: the very first screen is now a track choice —
/// normal training, or rehab for a current injury. Choosing rehab branches
/// to a much shorter flow (just picking the injury area, see
/// rehabAreaStep/rehabSummaryStep below) since none of discipline/
/// experience/equipment/trip-date apply to a rehab-first assignment.
/// Reused for BOTH first-time onboarding and Settings' "switch track"
/// action — the branch and its questions are identical either way, only
/// the caller's handling of onComplete differs (create a brand-new
/// profile vs. re-assign an existing one).
///
/// Ends by calling `onComplete` with a QuizResult (.standard or .rehab) —
/// this view has no opinion about what happens next (write to Supabase,
/// show the tutorial, etc.), that's the caller's job.
struct IntakeQuizView: View {
    var onComplete: (QuizResult) -> Void
    var onCancel: (() -> Void)? = nil

    private enum Track { case standard, rehab }

    @State private var track: Track? = nil
    @State private var rehabArea: QuizAnswers.RehabInjuryArea? = nil
    @State private var rehabStartingPoint: QuizAnswers.RehabStartingPoint? = nil
    @State private var answers = QuizAnswers()
    @State private var step = 0
    @State private var wantsTripDate = false

    /// Step 0 is always the track choice. Standard adds the 7 existing
    /// questions on top of that (8 total before the summary); rehab adds
    /// the injury area plus how far into recovery already (3 total).
    private var totalSteps: Int {
        track == .rehab ? 3 : 8
    }

    private var canAdvance: Bool {
        if step == 0 { return track != nil }
        if track == .rehab, step == 1 { return rehabArea != nil }
        if track == .rehab, step == 2 { return rehabStartingPoint != nil }
        return true
    }

    var body: some View {
        ZStack {
            SessionColours.bg.ignoresSafeArea()
            VStack(spacing: 0) {
                header
                Spacer(minLength: 0)
                Group {
                    if step == 0 {
                        trackChoiceStep
                    } else if track == .rehab {
                        switch step {
                        case 1: rehabAreaStep
                        case 2: rehabStartingPointStep
                        default: rehabSummaryStep
                        }
                    } else {
                        switch step {
                        case 1: disciplineStep
                        case 2: experienceStep
                        case 3: weaknessStep
                        case 4: equipmentStep
                        case 5: injuryStep
                        case 6: daysPerWeekStep
                        case 7: tripDateStep
                        default: standardSummaryStep
                        }
                    }
                }
                .transition(.opacity)
                Spacer(minLength: 0)
                footer
            }
            .padding(20)
        }
        .preferredColorScheme(.dark)
    }

    // MARK: - Chrome

    private var header: some View {
        HStack {
            if let onCancel {
                Button(action: onCancel) {
                    Text("CANCEL")
                        .font(.system(size: 11, weight: .bold, design: .monospaced))
                        .foregroundStyle(SessionColours.faint)
                }
            }
            Spacer()
            HStack(spacing: 5) {
                ForEach(0..<totalSteps, id: \.self) { i in
                    Circle()
                        .fill(i <= step ? SessionColours.fg : SessionColours.s3)
                        .frame(width: 6, height: 6)
                }
            }
        }
        .padding(.top, 8)
    }

    private var footer: some View {
        HStack(spacing: 12) {
            if step > 0 {
                Button(action: { withAnimation { step -= 1 } }) {
                    Text("BACK")
                        .font(.system(size: 13, weight: .bold, design: .monospaced))
                        .foregroundStyle(SessionColours.dim)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(SessionColours.s1)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
            }
            Button(action: advance) {
                Text(step == totalSteps ? "START TRAINING" : "NEXT")
                    .font(.system(size: 13, weight: .bold, design: .monospaced))
                    .foregroundStyle(SessionColours.bg)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(SessionColours.fg)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            }
            .disabled(!canAdvance)
            .opacity(canAdvance ? 1 : 0.4)
        }
        .padding(.bottom, 8)
    }

    private func advance() {
        guard canAdvance else { return }
        if step < totalSteps {
            withAnimation { step += 1 }
        } else if track == .rehab, let rehabArea, let rehabStartingPoint {
            onComplete(.rehab(rehabArea, startingPhase: rehabStartingPoint.rawValue))
        } else if track == .standard {
            onComplete(.standard(answers))
        }
    }

    // MARK: - Track choice (Phase C.1)

    private var trackChoiceStep: some View {
        stepScaffold(eyebrow: "1 of \(totalSteps)", title: "Training normally, or working through an injury?") {
            VStack(spacing: 10) {
                choiceCard(label: "Normal training", subtitle: "A full program matched to your climbing and goals", isSelected: track == .standard) {
                    track = .standard
                }
                choiceCard(label: "Rehab", subtitle: "For a current injury — a shorter, phase-based track focused on getting back to climbing safely", isSelected: track == .rehab) {
                    track = .rehab
                }
            }
        }
    }

    // MARK: - Rehab branch (Phase C.1)

    private var rehabAreaStep: some View {
        stepScaffold(eyebrow: "2 of \(totalSteps)", title: "What are you rehabbing?", subtitle: "General guidance built from published climbing-rehab protocols — not a diagnosis, and not a substitute for a physio.") {
            VStack(spacing: 10) {
                ForEach(QuizAnswers.RehabInjuryArea.allCases) { area in
                    choiceCard(label: area.label, subtitle: area.subtitle, isSelected: rehabArea == area) {
                        rehabArea = area
                    }
                }
            }
        }
    }

    private var rehabStartingPointStep: some View {
        stepScaffold(eyebrow: "3 of \(totalSteps)", title: "Where are you already?", subtitle: "So you don't have to start over if you've been dealing with this a while.") {
            VStack(spacing: 10) {
                ForEach(QuizAnswers.RehabStartingPoint.allCases) { point in
                    choiceCard(label: point.label, subtitle: point.subtitle, isSelected: rehabStartingPoint == point) {
                        rehabStartingPoint = point
                    }
                }
            }
        }
    }

    private var rehabSummaryStep: some View {
        let meta = rehabArea.flatMap { REHAB_META[$0.rawValue] }
        return stepScaffold(eyebrow: "READY", title: meta?.name ?? "Rehab") {
            VStack(alignment: .leading, spacing: 14) {
                if let meta {
                    Text(meta.description)
                        .font(.system(size: 14))
                        .foregroundStyle(SessionColours.dim)
                }
                Text(startingPointSummaryText)
                    .font(.system(size: 13))
                    .foregroundStyle(SessionColours.faint)
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(SessionColours.s1)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
    }

    private var startingPointSummaryText: String {
        switch rehabStartingPoint {
        case .justStarted, nil:
            return "Starts at the first phase — Tissue Unload. You'll move through Mobility, Strength, and Return to Climbing as you're ready, at your own pace."
        case .easingIn:
            return "Starts at Mobility, skipping Tissue Unload — you'll move through Strength and Return to Climbing as you're ready, at your own pace."
        case .rebuilding:
            return "Starts at Strength, skipping Unload and Mobility — you'll move through Return to Climbing as you're ready, at your own pace."
        case .almostBack:
            return "Starts at Return to Climbing, the final phase — you're already most of the way there."
        }
    }

    // MARK: - Standard branch steps

    private var disciplineStep: some View {
        stepScaffold(eyebrow: "2 of \(totalSteps)", title: "What do you climb?") {
            VStack(spacing: 10) {
                ForEach(QuizAnswers.Discipline.allCases) { d in
                    choiceCard(label: d.label, isSelected: answers.discipline == d) {
                        answers.discipline = d
                    }
                }
            }
        }
    }

    private var experienceStep: some View {
        stepScaffold(eyebrow: "3 of \(totalSteps)", title: "How experienced are you?") {
            VStack(spacing: 10) {
                ForEach(QuizAnswers.ExperienceLevel.allCases) { level in
                    choiceCard(
                        label: level.label,
                        subtitle: level.gradeRange(for: answers.discipline),
                        isSelected: answers.experienceLevel == level
                    ) {
                        answers.experienceLevel = level
                    }
                }
            }
        }
    }

    private var weaknessStep: some View {
        stepScaffold(eyebrow: "4 of \(totalSteps)", title: "Anything you want extra focus on?", subtitle: "Optional — skip if nothing stands out.") {
            VStack(spacing: 10) {
                ForEach(QuizAnswers.Weakness.allCases) { w in
                    choiceCard(label: w.label, isSelected: answers.weaknesses.contains(w)) {
                        toggle(w, in: &answers.weaknesses)
                    }
                }
            }
        }
    }

    private var equipmentStep: some View {
        stepScaffold(eyebrow: "5 of \(totalSteps)", title: "What do you have access to?", subtitle: "Select everything that applies — this only changes which exercises show up, not the plan itself.") {
            VStack(spacing: 10) {
                ForEach(QuizAnswers.Equipment.allCases) { e in
                    choiceCard(label: e.label, isSelected: answers.equipment.contains(e)) {
                        toggle(e, in: &answers.equipment)
                    }
                }
            }
        }
    }

    private var injuryStep: some View {
        stepScaffold(eyebrow: "6 of \(totalSteps)", title: "Any injury history worth flagging?", subtitle: "Optional — this adds caution notes and safety exercises, not a diagnosis. Not a substitute for real medical advice.") {
            VStack(spacing: 10) {
                ForEach(QuizAnswers.InjuryFlag.allCases) { flag in
                    choiceCard(label: flag.label, subtitle: flag.subtitle, isSelected: answers.injuryFlags.contains(flag)) {
                        toggle(flag, in: &answers.injuryFlags)
                    }
                }
            }
        }
    }

    private var daysPerWeekStep: some View {
        stepScaffold(eyebrow: "7 of \(totalSteps)", title: "How many days a week can you train?") {
            VStack(spacing: 24) {
                Text("\(answers.daysPerWeek)")
                    .font(.system(size: 64, weight: .heavy, design: .monospaced))
                    .foregroundStyle(SessionColours.fg)
                HStack(spacing: 20) {
                    stepperButton(symbol: "minus") { answers.daysPerWeek = max(2, answers.daysPerWeek - 1) }
                    stepperButton(symbol: "plus") { answers.daysPerWeek = min(6, answers.daysPerWeek + 1) }
                }
            }
        }
    }

    private var tripDateStep: some View {
        stepScaffold(eyebrow: "8 of \(totalSteps)", title: "Training toward a trip?", subtitle: "Optional — if you have a real date, the plan can taper toward it automatically.") {
            VStack(spacing: 14) {
                choiceCard(label: "No trip planned", isSelected: !wantsTripDate) {
                    wantsTripDate = false
                    answers.tripDate = nil
                }
                choiceCard(label: "Yes, I have a date", isSelected: wantsTripDate) {
                    wantsTripDate = true
                    if answers.tripDate == nil { answers.tripDate = Date().addingTimeInterval(60*60*24*56) }
                }
                if wantsTripDate {
                    DatePicker("", selection: Binding(get: { answers.tripDate ?? Date() }, set: { answers.tripDate = $0 }), displayedComponents: .date)
                        .datePickerStyle(.graphical)
                        .colorScheme(.dark)
                        .tint(SessionColours.fg)
                        .padding(12)
                        .background(SessionColours.s1)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
        }
    }

    private var standardSummaryStep: some View {
        let template = TEMPLATE_META[answers.templateId]
        return stepScaffold(eyebrow: "READY", title: template?.name ?? answers.templateId) {
            VStack(alignment: .leading, spacing: 14) {
                if let template {
                    Text(template.description)
                        .font(.system(size: 14))
                        .foregroundStyle(SessionColours.dim)
                }
                VStack(alignment: .leading, spacing: 8) {
                    summaryRow("Days / week", "\(answers.daysPerWeek)")
                    if !answers.weaknesses.isEmpty {
                        summaryRow("Extra focus", answers.weaknesses.map { $0.label }.joined(separator: ", "))
                    }
                    if !answers.equipment.isEmpty {
                        summaryRow("Equipment", answers.equipment.map { $0.label }.joined(separator: ", "))
                    }
                    if !answers.injuryFlags.isEmpty {
                        summaryRow("Flagged", answers.injuryFlags.map { $0.label }.joined(separator: ", "))
                    }
                    if let tripDate = answers.tripDate {
                        summaryRow("Trip date", tripDate.formatted(date: .abbreviated, time: .omitted))
                    }
                }
                .padding(16)
                .background(SessionColours.s1)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
    }

    private func summaryRow(_ label: String, _ value: String) -> some View {
        HStack(alignment: .top) {
            Text(label.uppercased())
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundStyle(SessionColours.faint)
                .frame(width: 100, alignment: .leading)
            Text(value)
                .font(.system(size: 13))
                .foregroundStyle(SessionColours.fg)
        }
    }

    // MARK: - Small building blocks

    private func stepScaffold<Content: View>(eyebrow: String, title: String, subtitle: String? = nil, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            Text(eyebrow)
                .font(.system(size: 11, weight: .bold, design: .monospaced))
                .foregroundStyle(SessionColours.faint)
                .tracking(1.5)
            Text(title)
                .font(.system(size: 28, weight: .heavy))
                .foregroundStyle(SessionColours.fg)
            if let subtitle {
                Text(subtitle)
                    .font(.system(size: 13))
                    .foregroundStyle(SessionColours.dim)
            }
            content()
                .padding(.top, 6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func choiceCard(label: String, subtitle: String? = nil, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text(label)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(SessionColours.fg)
                    if let subtitle {
                        Text(subtitle)
                            .font(.system(size: 12))
                            .foregroundStyle(SessionColours.dim)
                    }
                }
                Spacer()
                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(SessionColours.fg)
                }
            }
            .padding(16)
            .background(isSelected ? SessionColours.s2 : SessionColours.s1)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isSelected ? SessionColours.fg.opacity(0.4) : .clear, lineWidth: 1.5)
            )
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }

    private func stepperButton(symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(SessionColours.fg)
                .frame(width: 52, height: 52)
                .background(SessionColours.s1)
                .clipShape(Circle())
        }
        .buttonStyle(.plain)
    }

    private func toggle<T: Hashable>(_ value: T, in set: inout Set<T>) {
        if set.contains(value) { set.remove(value) } else { set.insert(value) }
    }
}

#Preview {
    IntakeQuizView(onComplete: { _ in })
}

import SwiftUI

/// Phase B proof-of-concept for the quiz, same idea as
/// NativeEngineDemoView was for the engine bridge itself: proves the whole
/// chain (quiz answers -> resolveTemplate() -> EngineBridge -> DailyCardView)
/// actually works end-to-end, without writing anywhere real. The
/// `templates`/`profiles` Supabase tables SUPABASE.md documents don't exist
/// yet — wiring a real write is a deliberate, separate step once those are
/// created, not something to do quietly as a side effect of building the
/// quiz UI.
struct QuizDemoView: View {
    private enum Stage { case quiz, tutorial, card }

    @State private var stage: Stage = .quiz
    @State private var result: QuizResult?
    @State private var state: DailyCardState?
    @State private var rehabBridge: RehabBridge?
    @State private var loadError: String?

    var body: some View {
        Group {
            switch stage {
            case .quiz:
                IntakeQuizView(onComplete: { r in
                    result = r
                    stage = .tutorial
                })
            case .tutorial:
                TutorialDemoCardView(onDone: { load() })
            case .card:
                if let loadError {
                    engineBridgeErrorView(loadError)
                } else if let rehabBridge, let phase = rehabBridge.currentPhase() {
                    RehabCardView(phase: phase, footerNote: "Native SwiftUI (quiz demo, not persisted) · rehab", onAdvance: {
                        rehabBridge.advance()
                    })
                } else if let state {
                    DailyCardView(
                        state: state,
                        footerNote: "Native SwiftUI (quiz demo, not persisted) · \(templateId) · \(state.today)"
                    )
                } else {
                    ZStack { SessionColours.bg.ignoresSafeArea(); ProgressView().tint(.white) }
                }
            }
        }
    }

    private var templateId: String {
        if case .standard(let answers) = result { return answers.templateId }
        return ""
    }

    private func load() {
        guard let result else { return }
        stage = .card
        switch result {
        case .standard(let answers):
            loadStandard(answers)
        case .rehab(let area):
            rehabBridge = try? RehabBridge(injuryArea: area.rawValue, phaseIndex: 0)
            if rehabBridge == nil { loadError = "RehabBridge failed to load for \(area.rawValue)" }
        }
    }

    private func loadStandard(_ answers: QuizAnswers) {
        do {
            let fmt = DateFormatter()
            fmt.locale = Locale(identifier: "en_US_POSIX")
            fmt.dateFormat = "yyyy-MM-dd"
            let startDate = fmt.string(from: Date().appDay)
            let bridge = try EngineBridge(
                templateId: answers.templateId,
                startDate: startDate,
                modifiers: answers.modifiersPayload,
                sessionLog: [:],
                loadLog: [:]
            )
            guard let s = DailyCardState.load(bridge: bridge) else {
                loadError = "engine returned incomplete data for template \(answers.templateId)"
                return
            }
            state = s
        } catch {
            loadError = "\(error)"
        }
    }
}

#Preview {
    QuizDemoView()
}

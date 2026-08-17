import SwiftUI

/// Shown once after the quiz, before first use — per the plan: "a short,
/// skippable walkthrough... reachable again later from a help/settings
/// entry point." Four screens, each a real thing on the daily card rather
/// than abstract feature marketing, since the whole point is orienting
/// someone who's about to see this UI for real in a few seconds.
struct OnboardingTutorialView: View {
    var onDone: () -> Void

    @State private var page = 0

    private struct Slide {
        let icon: String
        let title: String
        let body: String
    }

    private let slides: [Slide] = [
        Slide(icon: "figure.climbing",
              title: "Today's card",
              body: "Every day you open the app, you'll see one recommended session — what to do, and exactly how much. No decisions to make, just show up and follow it."),
        Slide(icon: "checkmark.circle",
              title: "Log as you go",
              body: "Tick off exercises as you do them, then mark the session done. Tap any other session dot to log something different instead — the plan adapts either way."),
        Slide(icon: "chart.bar",
              title: "The plan sheet",
              body: "Tap the phase badge at the top of the card any time to see the bigger picture — where you are in the block, what changes phase to phase, and why."),
        Slide(icon: "timer",
              title: "Built-in timers",
              body: "Rest and interval timers are wired into the exercises that need them — press Start and the app tracks the rest, the reps, and the sets for you."),
    ]

    var body: some View {
        ZStack {
            SessionColours.bg.ignoresSafeArea()
            VStack(spacing: 0) {
                HStack {
                    Spacer()
                    Button(action: onDone) {
                        Text("SKIP")
                            .font(.system(size: 11, weight: .bold, design: .monospaced))
                            .foregroundStyle(SessionColours.faint)
                    }
                }
                .padding(.top, 8)

                TabView(selection: $page) {
                    ForEach(Array(slides.enumerated()), id: \.offset) { i, slide in
                        slideView(slide).tag(i)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .always))
                .indexViewStyle(.page(backgroundDisplayMode: .always))

                Button(action: advance) {
                    Text(page == slides.count - 1 ? "GET STARTED" : "NEXT")
                        .font(.system(size: 13, weight: .bold, design: .monospaced))
                        .foregroundStyle(SessionColours.bg)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(SessionColours.fg)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .padding(.bottom, 8)
            }
            .padding(20)
        }
        .preferredColorScheme(.dark)
    }

    private func advance() {
        if page < slides.count - 1 {
            withAnimation { page += 1 }
        } else {
            onDone()
        }
    }

    private func slideView(_ slide: Slide) -> some View {
        VStack(spacing: 20) {
            Spacer()
            Image(systemName: slide.icon)
                .font(.system(size: 56, weight: .light))
                .foregroundStyle(SessionColours.fg)
            Text(slide.title)
                .font(.system(size: 26, weight: .heavy))
                .foregroundStyle(SessionColours.fg)
            Text(slide.body)
                .font(.system(size: 15))
                .foregroundStyle(SessionColours.dim)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)
            Spacer()
            Spacer()
        }
    }
}

#Preview {
    OnboardingTutorialView(onDone: {})
}

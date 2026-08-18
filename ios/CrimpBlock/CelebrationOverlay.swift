import SwiftUI

/// Native port of celebrate() in app.js — the quick, immediate "got it"
/// reaction the instant a session gets logged: a particle burst and a
/// checkmark, gone within about a second. DailyCardView's own loggedStamp
/// is what carries the actual lasting reward (the "LOGGED" card + tomorrow's
/// session) now — this used to duplicate that with its own similar card,
/// which meant the two showed up stacked on top of each other with
/// slightly different wording. Splitting the jobs cleanly: this is the
/// instant flash, loggedStamp is what's still there after.
struct CelebrationOverlay: View {
    /// Bump this to fire — a plain counter rather than a Bool so firing
    /// twice in a row (undo then immediately re-log) always re-triggers,
    /// which a Bool flipping true->true wouldn't.
    var trigger: Int
    var accent: Color

    private struct Particle: Identifiable {
        let id = UUID()
        let angle: Double     // degrees
        let distance: Double
        let delay: Double
    }

    @State private var particles: [Particle] = []
    @State private var showCheckmark = false
    @State private var expanded = false

    var body: some View {
        ZStack {
            ForEach(particles) { p in
                Circle()
                    .fill(accent)
                    .frame(width: 7, height: 7)
                    .offset(
                        x: expanded ? cos(p.angle * .pi / 180) * p.distance : 0,
                        y: expanded ? sin(p.angle * .pi / 180) * p.distance : 0
                    )
                    .opacity(expanded ? 0 : 1)
                    .animation(.easeOut(duration: 0.5).delay(p.delay), value: expanded)
            }
            if showCheckmark {
                Image(systemName: "checkmark")
                    .font(.system(size: 22, weight: .heavy))
                    .foregroundStyle(.white)
                    .frame(width: 50, height: 50)
                    .background(accent)
                    .clipShape(Circle())
                    .transition(.scale.combined(with: .opacity))
            }
        }
        .allowsHitTesting(false)
        .onChange(of: trigger) { _, _ in fire() }
    }

    private func fire() {
        let reduceMotion = UIAccessibility.isReduceMotionEnabled
        particles = reduceMotion ? [] : (0..<10).map { i in
            let baseAngle = 360.0 / 10.0 * Double(i)
            return Particle(
                angle: baseAngle + Double.random(in: -10...10),
                distance: Double.random(in: 60...100),
                delay: Double.random(in: 0...0.06)
            )
        }
        expanded = false
        withAnimation(.easeOut(duration: 0.2)) { showCheckmark = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.02) {
            withAnimation { expanded = true }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) {
            withAnimation(.easeOut(duration: 0.15)) { showCheckmark = false }
            particles = []
            expanded = false
        }
    }
}

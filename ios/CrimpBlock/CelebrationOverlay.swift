import SwiftUI

/// Native port of celebrate() in app.js, extended past what the web
/// version does — direct feedback that the original (just a strikethrough
/// + "Logged." line) was too quiet to actually notice: a real reward
/// moment on logging today's session. The quick particle burst + checkmark
/// still fires immediately as the initial "got it" reaction, then a bigger
/// card holds on screen long enough to actually read — "LOGGED", plus
/// tomorrow's real projected session (EngineBridge.upNext(), not a guess)
/// as a forward-looking nudge. Still auto-dismissing, nothing to tap or
/// close — a bigger moment, not a bigger interruption.
struct CelebrationOverlay: View {
    /// Bump this to fire — a plain counter rather than a Bool so firing
    /// twice in a row (undo then immediately re-log) always re-triggers,
    /// which a Bool flipping true->true wouldn't.
    var trigger: Int
    var accent: Color
    var nextUp: (key: String, name: String)?

    private struct Particle: Identifiable {
        let id = UUID()
        let angle: Double     // degrees
        let distance: Double
        let delay: Double
    }

    @State private var particles: [Particle] = []
    @State private var showCheckmark = false
    @State private var expanded = false
    @State private var showCard = false

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
            if showCard {
                stampCard
                    .transition(.scale(scale: 0.9).combined(with: .opacity))
            }
        }
        .allowsHitTesting(false)
        .onChange(of: trigger) { _, _ in fire() }
    }

    private var stampCard: some View {
        VStack(spacing: 6) {
            Text("LOGGED")
                .font(.system(size: 30, weight: .heavy))
                .foregroundStyle(.white)
            Text("Well done.")
                .font(.system(size: 14))
                .foregroundStyle(SessionColours.dim)
            if let nextUp {
                Rectangle()
                    .fill(SessionColours.s3)
                    .frame(height: 1)
                    .padding(.vertical, 8)
                Text("TOMORROW")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .foregroundStyle(SessionColours.faint)
                    .tracking(1.2)
                Text(nextUp.name.uppercased())
                    .font(.system(size: 19, weight: .bold))
                    .foregroundStyle(accent)
            }
        }
        .padding(.horizontal, 28)
        .padding(.vertical, 24)
        .background(SessionColours.s1)
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(accent.opacity(0.5), lineWidth: 1.5))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .shadow(color: .black.opacity(0.4), radius: 20, y: 8)
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
        // The card comes in just as the checkmark burst is finishing, not
        // simultaneously — landing on top of ten flying particles would
        // be visually noisy right as someone's trying to read it.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.75)) { showCard = true }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.4) {
            withAnimation(.easeOut(duration: 0.25)) { showCard = false }
        }
    }
}

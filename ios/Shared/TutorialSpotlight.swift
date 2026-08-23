import SwiftUI

/// A reusable spotlight/coach-mark system: dims the whole screen except a
/// cutout around one tagged view at a time, and only advances when the
/// REAL control inside that cutout is actually tapped — not a "Next"
/// button floating on top of it. Built for the post-quiz tutorial (see
/// TutorialDemoCardView), where the plan calls for something that "forces
/// you to do stuff" rather than a slideshow, but it's deliberately generic:
/// nothing here references the daily card specifically.

// MARK: - Tagging targets

private struct TutorialAnchorKey: PreferenceKey {
    static var defaultValue: [String: Anchor<CGRect>] = [:]
    static func reduce(value: inout [String: Anchor<CGRect>], nextValue: () -> [String: Anchor<CGRect>]) {
        value.merge(nextValue()) { _, new in new }
    }
}

extension View {
    /// Marks this view as a spotlightable target under `id`, for
    /// TutorialOverlay to find and cut a hole around. Pass nil to skip
    /// tagging conditionally — e.g. a toggle button that's only a
    /// meaningful tutorial target while in its collapsed state.
    func tutorialTarget(_ id: String?) -> some View {
        modifier(TutorialTargetModifier(id: id))
    }
}

private struct TutorialTargetModifier: ViewModifier {
    let id: String?
    func body(content: Content) -> some View {
        if let id {
            content.anchorPreference(key: TutorialAnchorKey.self, value: .bounds) { [id: $0] }
        } else {
            content
        }
    }
}

// MARK: - Step model + controller

struct TutorialStep {
    let targetID: String
    let title: String
    let body: String
    /// Shows a small bouncing "‹ SWIPE ›" badge above the spotlighted
    /// target — for a step whose real control is a gesture rather than a
    /// tap target, where the caption text alone doesn't make the motion
    /// obvious. Superseded by fullScreenSwipeDemo below for the one place
    /// this was actually used (kept as its own flag rather than merged,
    /// in case a smaller in-context hint is ever the right call somewhere
    /// else — the two aren't mutually exclusive in the type, just in
    /// practice so far).
    var showsSwipeHint: Bool = false
    /// A much bigger moment than the small pill above: the whole screen
    /// dims (but nothing is masked out — the real card stays fully
    /// visible and swipeable underneath) while a large left-right
    /// sweeping arrow animates across it. Direct feedback: the small
    /// pill wasn't obvious enough that this was a real gesture to try,
    /// not just decoration. Still only advances on an ACTUAL swipe
    /// (handleTap fires from the real onBrowse callback, same as every
    /// other step) — this changes how the invitation LOOKS, not the
    /// "real interaction required" rule every other step already holds to.
    var fullScreenSwipeDemo: Bool = false
}

/// Owns which step is showing. The tutorial's host view wires each real
/// control's own action closure to call `handleTap(_:)` alongside
/// whatever that control normally does — `handleTap` only advances if
/// `targetID` matches the step actually being shown, so a control that
/// happens to fire early (or a stray tap) can't skip a step out of order.
@Observable
final class TutorialController {
    let steps: [TutorialStep]
    private(set) var stepIndex = 0
    var finished = false

    init(steps: [TutorialStep]) {
        self.steps = steps
    }

    var currentStep: TutorialStep? {
        stepIndex < steps.count ? steps[stepIndex] : nil
    }

    func handleTap(_ targetID: String) {
        guard currentStep?.targetID == targetID else { return }
        advance()
    }

    func advance() {
        if stepIndex < steps.count - 1 { stepIndex += 1 } else { finished = true }
    }

    func skip() { finished = true }
}

// MARK: - Overlay

/// A hole-punched dimming shape — even-odd fill means the hole rects are
/// excluded from both the visual fill AND (via `.contentShape(_:eoFill:)`)
/// hit-testing, which is what lets a real tap fall through the hole to the
/// actual control underneath while everything outside it stays blocked.
private struct SpotlightMask: Shape {
    var hole: CGRect
    let cornerRadius: CGFloat

    /// Without this, the hole would still jump instantly between targets
    /// even with an .animation() modifier applied outside — a plain Shape
    /// only animates via its `animatableData`; SwiftUI has no way to
    /// interpolate between two different `path(in:)` outputs on its own.
    var animatableData: AnimatablePair<AnimatablePair<CGFloat, CGFloat>, AnimatablePair<CGFloat, CGFloat>> {
        get { AnimatablePair(AnimatablePair(hole.origin.x, hole.origin.y), AnimatablePair(hole.width, hole.height)) }
        set {
            hole = CGRect(x: newValue.first.first, y: newValue.first.second, width: newValue.second.first, height: newValue.second.second)
        }
    }

    func path(in rect: CGRect) -> Path {
        var path = Path(rect)
        path.addPath(Path(roundedRect: hole, cornerRadius: cornerRadius))
        return path
    }
}

extension View {
    /// Wraps THIS view with a spotlight overlay that reads
    /// `.tutorialTarget(_:)` anchors from anywhere in its own subtree.
    /// Must be applied to a view that actually contains the tagged
    /// targets as descendants — `.overlayPreferenceValue` only sees
    /// preferences bubbling up through real parent/child structure;
    /// attaching this to a sibling of the tagged content (e.g. a
    /// neighbour in the same ZStack) silently sees no anchors at all.
    func tutorialOverlay(_ controller: TutorialController, isActive: Bool) -> some View {
        modifier(TutorialOverlayModifier(controller: controller, isActive: isActive))
    }
}

private struct TutorialOverlayModifier: ViewModifier {
    let controller: TutorialController
    let isActive: Bool

    func body(content: Content) -> some View {
        content.overlayPreferenceValue(TutorialAnchorKey.self) { anchors in
            if isActive {
                GeometryReader { proxy in
                    if let step = controller.currentStep, let anchor = anchors[step.targetID] {
                        spotlight(step: step, rect: proxy[anchor].insetBy(dx: -8, dy: -10), screenSize: proxy.size)
                            .allowsHitTesting(true)
                            // Ties the mask hole (now Animatable, see
                            // SpotlightMask), the ring, and the caption
                            // card's frame/position together so advancing
                            // a step slides smoothly to the next target
                            // instead of jumping — previously had no
                            // animation at all.
                            .animation(.easeInOut(duration: 0.3), value: step.targetID)
                    }
                }
                .ignoresSafeArea()
            }
        }
    }

    @ViewBuilder
    private func spotlight(step: TutorialStep, rect: CGRect, screenSize: CGSize) -> some View {
        if step.fullScreenSwipeDemo {
            fullScreenSwipeSpotlight(step: step, screenSize: screenSize)
        } else {
            let mask = SpotlightMask(hole: rect, cornerRadius: 14)
            ZStack {
                mask
                    .fill(Color.black.opacity(0.75), style: FillStyle(eoFill: true))
                    .contentShape(mask, eoFill: true)
                    .onTapGesture {} // absorbs taps outside the hole; the hole itself has no shape here, so real taps there fall through to the control beneath

                RoundedRectangle(cornerRadius: 14)
                    .stroke(SessionColours.fg, lineWidth: 2)
                    .frame(width: rect.width, height: rect.height)
                    .position(x: rect.midX, y: rect.midY)
                    .allowsHitTesting(false)

                if step.showsSwipeHint {
                    SwipeHintBadge()
                        .position(x: rect.midX, y: max(30, rect.minY - 30))
                        .allowsHitTesting(false)
                }

                captionCard(step: step, rect: rect, screenSize: screenSize)
                    .allowsHitTesting(true)
            }
        }
    }

    /// No mask/hole here at all — the whole card stays visible AND
    /// hit-testable (nothing in this layer intercepts touches except the
    /// caption card's own SKIP link), because the thing being taught is a
    /// gesture across the card itself, not a single tappable spot. A
    /// light full-screen dim plus a large sweeping arrow is the "big,
    /// obvious moment" the small pill badge wasn't managing on its own.
    private func fullScreenSwipeSpotlight(step: TutorialStep, screenSize: CGSize) -> some View {
        ZStack {
            Color.black.opacity(0.35)
                .ignoresSafeArea()
                .allowsHitTesting(false)

            BigSwipeArrow()
                .frame(height: 90)
                .position(x: screenSize.width / 2, y: screenSize.height * 0.42)
                .allowsHitTesting(false)

            // The same captionCard every other step uses — position()
            // computes its coordinates from `rect` and `screenSize`
            // directly, so a thin fake rect pinned near the top is
            // enough to reuse it unmodified; x is always screen-centred
            // regardless of rect, only rect.maxY/minY affects placement.
            captionCard(step: step, rect: CGRect(x: 0, y: 40, width: screenSize.width, height: 1), screenSize: screenSize)
                .allowsHitTesting(true)
        }
    }

    private func captionCard(step: TutorialStep, rect: CGRect, screenSize: CGSize) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("\(controller.stepIndex + 1) OF \(controller.steps.count)")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .foregroundStyle(SessionColours.faint)
                Spacer()
                Button(action: { controller.skip() }) {
                    Text("SKIP")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundStyle(SessionColours.faint)
                }
            }
            Text(step.title)
                .font(.system(size: 19, weight: .heavy))
                .foregroundStyle(SessionColours.fg)
            Text(step.body)
                .font(.system(size: 13.5))
                .foregroundStyle(SessionColours.dim)
            Text("Tap the highlighted area to continue")
                .font(.system(size: 10, weight: .semibold, design: .monospaced))
                .foregroundStyle(SessionColours.faint)
                .padding(.top, 2)
        }
        .padding(16)
        .frame(width: min(320, screenSize.width - 40), alignment: .leading)
        .background(SessionColours.s1)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(SessionColours.s3, lineWidth: 1))
        .position(captionPosition(rect: rect, screenSize: screenSize))
    }

    /// Below the hole when there's room, above it otherwise — clamped so
    /// the card never runs past the top/bottom of the screen regardless
    /// of where on the card the target happens to sit.
    private func captionPosition(rect: CGRect, screenSize: CGSize) -> CGPoint {
        let cardHalfHeight: CGFloat = 100
        let fitsBelow = rect.maxY + cardHalfHeight * 2 < screenSize.height
        let y = fitsBelow ? rect.maxY + cardHalfHeight : rect.minY - cardHalfHeight
        return CGPoint(x: screenSize.width / 2, y: min(max(y, cardHalfHeight + 20), screenSize.height - cardHalfHeight - 20))
    }
}

/// The big version — used by fullScreenSwipeDemo instead of the small
/// pill. Two chevrons slide outward from centre and fade, on a loop,
/// reading unambiguously as "drag this way, or that way" rather than the
/// pill's smaller, easier-to-miss rocking motion. Purely decorative, same
/// as SwipeHintBadge below — the real gesture target is the card itself.
private struct BigSwipeArrow: View {
    @State private var expanded = false

    var body: some View {
        GeometryReader { proxy in
            let spread = proxy.size.width * 0.28
            ZStack {
                chevron(systemName: "chevron.left")
                    .offset(x: expanded ? -spread : -spread * 0.35)
                    .opacity(expanded ? 0 : 1)
                chevron(systemName: "chevron.right")
                    .offset(x: expanded ? spread : spread * 0.35)
                    .opacity(expanded ? 0 : 1)
                Text("SWIPE")
                    .font(.system(size: 13, weight: .bold, design: .monospaced))
                    .tracking(3)
                    .foregroundStyle(SessionColours.fg.opacity(0.85))
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
        }
        .onAppear {
            // autoreverses: true, not false — a Bool only has two states,
            // so the "loop" here IS the reverse: out-and-fade, then back
            // to centre-and-visible, repeating. autoreverses: false would
            // hold at the fully-expanded/faded end state after the first
            // cycle with nothing left to animate.
            withAnimation(.easeOut(duration: 0.9).repeatForever(autoreverses: true)) {
                expanded = true
            }
        }
    }

    private func chevron(systemName: String) -> some View {
        Image(systemName: systemName)
            .font(.system(size: 46, weight: .bold))
            .foregroundStyle(SessionColours.fg)
            .shadow(color: .black.opacity(0.5), radius: 10)
    }
}

/// A small rocking "‹ SWIPE ›" pill — purely decorative, gestures have no
/// tap target of their own to circle the way every other step's real
/// control does, so this is the substitute for "here's the thing to try."
private struct SwipeHintBadge: View {
    @State private var rocked = false

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "chevron.left")
            Text("SWIPE")
                .font(.system(size: 11, weight: .bold, design: .monospaced))
                .tracking(1.5)
            Image(systemName: "chevron.right")
        }
        .font(.system(size: 12, weight: .bold))
        .foregroundStyle(SessionColours.fg)
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .background(SessionColours.s1)
        .clipShape(Capsule())
        .overlay(Capsule().stroke(SessionColours.fg.opacity(0.4), lineWidth: 1))
        .shadow(color: .black.opacity(0.3), radius: 8, y: 3)
        .offset(x: rocked ? 6 : -6)
        .onAppear {
            withAnimation(.easeInOut(duration: 0.7).repeatForever(autoreverses: true)) {
                rocked = true
            }
        }
    }
}

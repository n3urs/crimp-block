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
    let hole: CGRect
    let cornerRadius: CGFloat
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
                    }
                }
                .ignoresSafeArea()
            }
        }
    }

    @ViewBuilder
    private func spotlight(step: TutorialStep, rect: CGRect, screenSize: CGSize) -> some View {
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

            captionCard(step: step, rect: rect, screenSize: screenSize)
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

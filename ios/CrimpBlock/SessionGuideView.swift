import SwiftUI

/// A standing reference page for one session — pulled up from the small
/// "GUIDE" pill under the session title, only where a session actually has
/// one (EngineBridge.SessionGuide is nil everywhere else). Deliberately
/// separate from the day's own short `note` (that changes tone week to
/// week — deload, returning) and from any one exercise's own description
/// (scoped to that exercise) — a guide is considered, sourced, and stable
/// across weeks, so it gets its own page rather than crowding either.
struct SessionGuideView: View {
    let guide: EngineBridge.SessionGuide
    let accent: Color
    var onDismiss: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 26) {
                HStack {
                    Text(guide.title.uppercased())
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
                ForEach(Array(guide.sections.enumerated()), id: \.offset) { index, section in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(section.heading.uppercased())
                            .font(AppFonts.mono(12, weight: .bold))
                            .foregroundStyle(accent)
                        Text(section.body)
                            .font(.system(size: 14.5))
                            .foregroundStyle(SessionColours.dim)
                            .lineSpacing(3)
                    }
                    if index < guide.sections.count - 1 {
                        Rectangle().fill(SessionColours.s2).frame(height: 1)
                    }
                }
            }
            .padding(20)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(SessionColours.bg)
    }
}

import SwiftUI

/// Native equivalent of weightSheet() in app.js — set a working weight for
/// one exercise. Same +/- nudge-by-step affordance, same "no floor at 0"
/// reasoning (negative is a real value here — assistance taken off, e.g. a
/// band or a pulley — not an error).
struct WeightEditView: View {
    let exercise: EngineBridge.RenderedExercise
    var onSave: (Double) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var value: Double

    init(exercise: EngineBridge.RenderedExercise, onSave: @escaping (Double) -> Void) {
        self.exercise = exercise
        self.onSave = onSave
        _value = State(initialValue: exercise.weightKg ?? 0)
    }

    var body: some View {
        NavigationStack {
            ZStack {
                SessionColours.bg.ignoresSafeArea()
                VStack(spacing: 20) {
                    Text(exercise.title)
                        .font(.system(size: 22, weight: .heavy))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    HStack(spacing: 14) {
                        Button(action: { value -= exercise.step }) {
                            Text("−").font(.system(size: 28, weight: .bold))
                                .frame(width: 52, height: 52)
                                .foregroundStyle(.white)
                                .background(SessionColours.s2)
                                .clipShape(Circle())
                        }
                        Text("\(value.formatted(.number.precision(.fractionLength(0...2))))kg")
                            .font(.system(size: 34, weight: .bold, design: .monospaced))
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                        Button(action: { value += exercise.step }) {
                            Text("+").font(.system(size: 28, weight: .bold))
                                .frame(width: 52, height: 52)
                                .foregroundStyle(.white)
                                .background(SessionColours.s2)
                                .clipShape(Circle())
                        }
                    }

                    Spacer()

                    Button(action: { onSave(value); dismiss() }) {
                        Text("SAVE")
                            .font(.system(size: 13, weight: .bold, design: .monospaced))
                            .foregroundStyle(SessionColours.bg)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(SessionColours.resolve("--gorse"))
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                }
                .padding(24)
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}

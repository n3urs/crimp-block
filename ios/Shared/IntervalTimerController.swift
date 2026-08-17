import Foundation
import UIKit

/// Native port of the auto-cycling repeater timer state machine
/// (startIntervalTimer/ivtAdvance/ivtStep/finishIntervalTimer/
/// stopIntervalTimer in app.js) — press once and it runs every rep of
/// every set unattended, including the rest BETWEEN sets, exactly like
/// the web version. No Live Activity here, deliberately: the screen is
/// meant to stay on throughout (isIdleTimerDisabled), so there is nothing
/// for a Lock Screen to show.
@Observable
final class IntervalTimerController {
    enum Phase: Equatable { case ready, on, off, setrest, done }

    private(set) var phase: Phase?
    private(set) var set = 1
    private(set) var rep = 1
    private(set) var sets = 1
    private(set) var reps = 1
    private(set) var label = ""
    private(set) var tTot: Int = 0
    private(set) var remainingSeconds: Int = 0

    private var onSecs = 0
    private var offSecs = 0
    private var setRestSecs = 0
    private var tEnd: Date = .distantPast
    private var timer: Timer?
    private let tones = IntervalTonePlayer()

    /// Time to put the phone down and get hands on the board before the
    /// first rep starts counting — without this, pressing Start and then
    /// getting into position eats into (or entirely swallows) the first
    /// hang. Same 5s as app.js's READY_SECS.
    static let readySecs = 5

    var isActive: Bool { phase != nil }

    /// `sets` is deliberately a parameter here, not derived internally —
    /// the caller reads it from the CURRENTLY resolved prescription text
    /// (already phase- and deload-adjusted), same as app.js's
    /// `parseInt(prescText, 10)`, so a deload week runs fewer sets with no
    /// extra logic on this end.
    func start(config: EngineBridge.IntervalConfig, setRestSecs: Int, sets: Int, label: String) {
        stop()
        onSecs = config.on
        offSecs = config.off
        reps = max(1, config.reps)
        self.setRestSecs = setRestSecs
        self.sets = max(1, sets)
        self.label = label
        set = 1
        rep = 1
        phase = .ready
        tTot = Self.readySecs
        tEnd = Date().addingTimeInterval(Double(Self.readySecs))
        remainingSeconds = Self.readySecs

        UIApplication.shared.isIdleTimerDisabled = true
        timer = Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { [weak self] _ in self?.tick() }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
        phase = nil
        UIApplication.shared.isIdleTimerDisabled = false
    }

    private func tick() {
        let left = max(0, Int(tEnd.timeIntervalSinceNow.rounded()))
        remainingSeconds = left
        if left <= 0 { advance() }
    }

    private func advance() {
        guard let phase else { return }
        let next: Phase
        switch phase {
        case .ready:
            next = .on
        case .on:
            next = .off
        case .off:
            if rep < reps { rep += 1; next = .on }
            else if set < sets { next = .setrest }
            else { finish(); return }
        case .setrest:
            set += 1; rep = 1; next = .on
        case .done:
            return
        }
        self.phase = next
        tTot = next == .on ? onSecs : next == .off ? offSecs : setRestSecs
        tEnd = Date().addingTimeInterval(Double(tTot))
        remainingSeconds = tTot
        tones.play(next == .on ? .go : .rest)
    }

    private func finish() {
        tones.play(.go)
        timer?.invalidate()
        timer = nil
        phase = .done
        UIApplication.shared.isIdleTimerDisabled = false
        // Auto-clears after a beat, same 1.4s as app.js's finishIntervalTimer.
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) { [weak self] in
            guard let self, self.phase == .done else { return } // don't clobber a NEW timer started in the meantime
            self.phase = nil
        }
    }

    /// Mirrors ivtRender()'s $('ivtP').textContent logic exactly.
    var statusText: String {
        switch phase {
        case .ready: return "GET READY — SET \(set) OF \(sets)"
        case .setrest: return "SET \(set) OF \(sets) · REST BEFORE SET \(set + 1)"
        case .on: return "SET \(set) OF \(sets) · REP \(rep) OF \(reps) · HANG"
        case .off: return "SET \(set) OF \(sets) · REP \(rep) OF \(reps) · REST"
        case .done: return "DONE — ALL \(sets) SETS"
        case nil: return ""
        }
    }
}

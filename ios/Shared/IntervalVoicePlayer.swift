import AVFoundation

/// Spoken cues for the repeater timer, replacing the earlier tone-based
/// system (two sine-wave beeps, one for go and one for rest) per direct
/// feedback: running unattended while hanging off a board, an actual word
/// ("Go", "Stop") read clearer than learning to tell two beep pitches
/// apart by ear.
///
/// `.playback` (not `.ambient`, what the old tone player used) is what
/// makes this audible with the phone's physical silent switch flipped —
/// the whole point of a workout cue is being heard hands-off regardless
/// of ring/silent state, and `.ambient` is silenced by that switch by
/// design. `.playback` also plays at full media volume rather than
/// `.ambient`'s quieter routing, which is most of what "up the volume"
/// actually needed — the utterance's own volume was already maxed.
final class IntervalVoicePlayer {
    enum Cue { case getReady, go, stop, done }

    private let synthesizer = AVSpeechSynthesizer()
    private var sessionConfigured = false

    private func ensureAudioSession() {
        guard !sessionConfigured else { return }
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .voicePrompt, options: [.mixWithOthers, .duckOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
        sessionConfigured = true
    }

    func speak(_ cue: Cue) {
        ensureAudioSession()
        let text: String
        switch cue {
        case .getReady: text = "Get ready"
        case .go: text = "Go"
        case .stop: text = "Stop"
        case .done: text = "Done"
        }
        let utterance = AVSpeechUtterance(string: text)
        // A bit more deliberate than AVSpeechUtterance's conversational
        // default rate — reads more like a coach's cue than someone
        // talking quickly.
        utterance.rate = 0.48
        utterance.volume = 1
        synthesizer.speak(utterance)
    }
}

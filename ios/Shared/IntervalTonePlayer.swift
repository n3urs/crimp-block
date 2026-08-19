import AVFoundation

/// Musical cues for the repeater timer. Second attempt at this — a first
/// pass tried spoken words (AVSpeechSynthesizer) per an earlier request,
/// but that didn't land well and got reverted in favour of tones again,
/// this time with real melodic shape rather than the original's flat
/// pitch-only beeps (a rising double-beep for go, a single low tone for
/// rest) — closer to how Griptonite/Grippy's hangboard timer reportedly
/// uses soft piano-like tones rather than a plain alarm beep. Each cue
/// here is a short melody with its own contour and note count, not just a
/// different pitch, so telling them apart doesn't require close
/// listening: ready repeats one note, go rises, stop falls, done is a
/// longer rising flourish.
///
/// `.playback` (not `.ambient`) is what makes this audible with the
/// phone's physical silent switch flipped and plays at real media volume
/// rather than `.ambient`'s quieter routing — kept from the voice
/// attempt, since that part of the feedback was separate from "I don't
/// like the voice" and still applies here.
final class IntervalTonePlayer {
    enum Cue { case ready, go, stop, done }

    private static let sampleRate = 44_100.0

    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private var started = false

    /// Mono, and used for BOTH the engine connection and every generated
    /// buffer — connecting with `format: nil` picks up the mixer's own
    /// (stereo) format, and scheduling a mono buffer against a
    /// stereo-connected node throws and crashes the instant a cue tries
    /// to play. One shared format used everywhere is what keeps that from
    /// silently reappearing.
    private let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1)!

    init() {
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: format)
    }

    private func ensureStarted() {
        guard !started else { return }
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.mixWithOthers, .duckOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
        try? engine.start()
        started = true
    }

    /// Each note is (frequency in Hz, start offset in seconds) — played
    /// with the same short, piano-ish envelope regardless of cue, so the
    /// only thing that changes between cues is the melody itself.
    private static let melodies: [Cue: [(freq: Double, at: Double)]] = [
        .ready: [(784, 0), (784, 0.22)],                    // G5 repeated -- an alert, not a direction
        .go:    [(659, 0), (880, 0.09)],                    // E5 -> A5, rising
        .stop:  [(440, 0), (330, 0.11)],                    // A4 -> E4, falling
        .done:  [(523, 0), (659, 0.11), (784, 0.22), (1047, 0.36)], // C5 -> E5 -> G5 -> C6, a small fanfare
    ]

    func play(_ cue: Cue) {
        ensureStarted()
        for note in Self.melodies[cue] ?? [] {
            guard let buffer = Self.pianoish(frequency: note.freq, duration: cue == .done ? 0.3 : 0.2, format: format) else { continue }
            if note.at > 0 {
                DispatchQueue.main.asyncAfter(deadline: .now() + note.at) { [weak self] in self?.schedule(buffer) }
            } else {
                schedule(buffer)
            }
        }
    }

    private func schedule(_ buffer: AVAudioPCMBuffer) {
        player.scheduleBuffer(buffer, at: nil)
        if !player.isPlaying { player.play() }
    }

    /// A fundamental plus two quieter harmonics with a quick-attack,
    /// exponential-ish decay envelope — a plain single sine wave reads as
    /// a flat electronic "beep"; layering harmonics this way is a cheap,
    /// believable approximation of a struck, piano/bell-like note without
    /// needing a real sampled asset.
    private static func pianoish(frequency: Double, duration: Double, format: AVAudioFormat) -> AVAudioPCMBuffer? {
        let frameCount = AVAudioFrameCount(duration * sampleRate)
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount),
              let channel = buffer.floatChannelData?[0] else { return nil }
        buffer.frameLength = frameCount

        let attack = 0.008
        for frame in 0..<Int(frameCount) {
            let t = Double(frame) / sampleRate
            let envelope: Double
            if t < attack {
                envelope = t / attack
            } else {
                // Decays to ~10% over the note's duration -- a struck,
                // ringing-out feel rather than a sustained tone that just
                // cuts off at the end.
                envelope = pow(0.1, (t - attack) / (duration - attack))
            }
            let fundamental = sin(2.0 * .pi * frequency * t)
            let secondHarmonic = sin(2.0 * .pi * frequency * 2 * t) * 0.28
            let thirdHarmonic = sin(2.0 * .pi * frequency * 3 * t) * 0.12
            channel[frame] = Float((fundamental + secondHarmonic + thirdHarmonic) * envelope * 0.3)
        }
        return buffer
    }
}

import AVFoundation

/// Native equivalent of tone() in app.js — two tones, not one: this runs
/// while hanging off a board looking at your hand, not the phone, so the
/// SOUND has to carry which phase just started. A rising double-beep means
/// go, a single low one means rest. Distinct from the plain rest timer's
/// completion sound on purpose, so the two timers never sound the same.
///
/// Generates real sine-wave tones (matching the web's oscillator + gain
/// envelope) rather than reaching for a generic system sound — same
/// frequencies (880/1180Hz for go, 420Hz for rest), same quick attack/decay
/// envelope to avoid a click at the edges.
final class IntervalTonePlayer {
    enum Kind { case go, rest }

    private static let sampleRate = 44_100.0

    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private var started = false

    /// Mono, and used for BOTH the engine connection and every generated
    /// buffer — a real crash caught in simulator testing: connecting with
    /// `format: nil` picks up the mixer's own (stereo) format, and
    /// scheduling a mono buffer against a stereo-connected node throws
    /// ("_outputFormat.channelCount == buffer.format.channelCount"),
    /// crashing the app the instant a tone tried to play. One shared format
    /// used everywhere is what keeps this from silently reappearing.
    private let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1)!

    init() {
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: format)
    }

    /// Started lazily, on first real use — mirrors unlockAudio() in app.js,
    /// which creates its AudioContext inside a real tap rather than eagerly,
    /// for the same underlying reason iOS cares about too: audio session
    /// activation belongs next to a genuine user action.
    private func ensureStarted() {
        guard !started else { return }
        try? AVAudioSession.sharedInstance().setCategory(.ambient, options: [.mixWithOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
        try? engine.start()
        started = true
    }

    func play(_ kind: Kind) {
        ensureStarted()
        let freqs: [Double] = kind == .go ? [880, 1180] : [420]
        let gap: Double = kind == .go ? 0.13 : 0
        let duration: Double = kind == .go ? 0.16 : 0.32

        for (i, freq) in freqs.enumerated() {
            guard let buffer = Self.sineBuffer(frequency: freq, duration: duration, format: format) else { continue }
            let delay = Double(i) * gap
            if delay > 0 {
                DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                    self?.schedule(buffer)
                }
            } else {
                schedule(buffer)
            }
        }
    }

    private func schedule(_ buffer: AVAudioPCMBuffer) {
        player.scheduleBuffer(buffer, at: nil)
        if !player.isPlaying { player.play() }
    }

    /// A short linear fade in/out rather than the web's exponential ramp —
    /// close enough perceptually, and avoids the click a hard-edged tone
    /// would otherwise have.
    private static func sineBuffer(frequency: Double, duration: Double, format: AVAudioFormat) -> AVAudioPCMBuffer? {
        let frameCount = AVAudioFrameCount(duration * sampleRate)
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount),
              let channel = buffer.floatChannelData?[0] else { return nil }
        buffer.frameLength = frameCount

        let attack = 0.015
        let releaseStart = duration - 0.02
        for frame in 0..<Int(frameCount) {
            let t = Double(frame) / sampleRate
            let envelope: Double
            if t < attack { envelope = t / attack }
            else if t > releaseStart { envelope = max(0, (duration - t) / (duration - releaseStart)) }
            else { envelope = 1 }
            channel[frame] = Float(sin(2.0 * .pi * frequency * t) * envelope * 0.32)
        }
        return buffer
    }
}

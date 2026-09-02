import Foundation
import ActivityKit

/// The rest timer's Live Activity — same idea as a parking-meter countdown:
/// visible on the Lock Screen and in the Dynamic Island, so the phone does
/// not need to be unlocked or the app open to see time remaining.
///
/// `endDate` (not `secondsRemaining`) is deliberate: the Lock Screen and
/// Dynamic Island render this with `Text(timerInterval:)` /
/// `ProgressView(timerInterval:)`, which tick live on the SYSTEM clock with
/// no further updates from the app. A remaining-seconds count would need a
/// fresh update pushed roughly once a second to stay accurate, which is not
/// how Live Activities are meant to work and would drain battery doing it.
struct RestTimerAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var endDate: Date
    }

    var label: String        // exercise name, e.g. "Pickups — half crimp"
    var totalSeconds: Int    // for the progress bar's start point
    var colour: String       // session accent hex, e.g. "#F2B134" — parsed via parseHexColour() in Forecast.swift
}

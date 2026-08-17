import Foundation
import ActivityKit
import UserNotifications

/// The rest timer's Live Activity + completion-notification lifecycle,
/// extracted so both the web bridge (ContentView's Coordinator, driven by
/// app.js's pushTimerNative()) and native SwiftUI screens can start/stop
/// the same kind of timer without duplicating this ActivityKit code twice.
///
/// `endDate` (not remaining-seconds) is deliberate, same reasoning as
/// RestTimerAttributes itself: the Lock Screen and Dynamic Island render
/// with `Text(timerInterval:)`, which ticks on the system clock with no
/// further app updates — this class just needs to hand it a fixed end time.
@Observable
final class RestTimerController {
    private(set) var endDate: Date?
    private(set) var totalSeconds: Int = 0
    private(set) var label: String = ""

    private var activity: Activity<RestTimerAttributes>?
    private let notificationID = "rest-timer"

    func requestNotificationPermission() {
        UNUserNotificationCenter.current()
            .requestAuthorization(options: [.alert, .sound]) { _, _ in }
    }

    /// `colourHex` must be a resolved hex string (e.g. "#F2B134"), not a CSS
    /// variable name — RestTimerAttributes/parseHexColour() work in hex,
    /// same contract as the web bridge's `v('--c')` already resolves to.
    func start(secs: Int, label: String, colourHex: String) {
        end(cancelNotification: true) // never leave a stale activity running under a new one

        let end = Date().addingTimeInterval(TimeInterval(secs))
        self.endDate = end
        self.totalSeconds = secs
        self.label = label

        let attrs = RestTimerAttributes(label: label, totalSeconds: secs, colour: colourHex)
        let state = RestTimerAttributes.ContentState(endDate: end)
        // A generous stale date, not a hard timeout — see ContentView's
        // original comment: if "stop" is ever missed (force-quit mid-rest),
        // this is what keeps an expired countdown from sitting there
        // forever, without this code having to guess when to tidy up.
        let stale = end.addingTimeInterval(5 * 60)

        activity = try? Activity.request(
            attributes: attrs,
            content: .init(state: state, staleDate: stale),
            pushType: nil
        )

        scheduleCompletionNotification(secs: secs, label: label)
    }

    func end(cancelNotification: Bool) {
        if let activity {
            Task { await activity.end(nil, dismissalPolicy: .immediate) }
            self.activity = nil
        }
        endDate = nil
        if cancelNotification {
            UNUserNotificationCenter.current()
                .removePendingNotificationRequests(withIdentifiers: [notificationID])
        }
    }

    private func scheduleCompletionNotification(secs: Int, label: String) {
        let content = UNMutableNotificationContent()
        content.title = "Rest over"
        content.body = label
        content.sound = .default

        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: TimeInterval(secs), repeats: false)
        let request = UNNotificationRequest(identifier: notificationID, content: content, trigger: trigger)

        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [notificationID])
        center.add(request)
    }
}

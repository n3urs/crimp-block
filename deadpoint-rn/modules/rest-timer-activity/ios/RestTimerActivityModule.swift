import ExpoModulesCore
import ActivityKit

public class RestTimerActivityModule: Module {
  private var restActivity: Activity<RestTimerAttributes>?

  public func definition() -> ModuleDefinition {
    Name("RestTimerActivity")

    Function("startRestActivity") { (secs: Int, label: String, colour: String) in
      self.endRestActivity(cancelNotification: true)

      guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }

      let end = Date().addingTimeInterval(TimeInterval(secs))
      let attrs = RestTimerAttributes(label: label, totalSeconds: secs, colour: colour)
      let state = RestTimerAttributes.ContentState(endDate: end)
      let stale = end.addingTimeInterval(5 * 60)

      self.restActivity = try? Activity.request(
        attributes: attrs,
        content: .init(state: state, staleDate: stale),
        pushType: nil
      )
    }

    Function("endRestActivity") { (cancelNotification: Bool) in
      self.endRestActivity(cancelNotification: cancelNotification)
    }
  }

  private func endRestActivity(cancelNotification: Bool) {
    if let activity = restActivity {
      Task { await activity.end(nil, dismissalPolicy: .immediate) }
      restActivity = nil
    }
  }
}

import WidgetKit
import SwiftUI

// TODO(Task 4): add RestTimerLiveActivity() here — the real source's bundle
// (ios/CrimpBlockWidget/CrimpBlockWidget.swift on main) is:
//   @main
//   struct CrimpBlockWidgetBundle: WidgetBundle {
//       var body: some Widget {
//           CrimpBlockWidget()
//           RestTimerLiveActivity()
//       }
//   }
// RestTimerLiveActivity doesn't exist yet — Task 4 adds it and restores the
// second line above.
@main
struct CrimpBlockWidgetBundle: WidgetBundle {
    var body: some Widget {
        CrimpBlockWidget()
    }
}

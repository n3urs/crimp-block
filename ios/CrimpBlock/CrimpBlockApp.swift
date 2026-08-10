import SwiftUI

@main
struct CrimpBlockApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .ignoresSafeArea(.container, edges: .bottom)
                .preferredColorScheme(.dark)
        }
    }
}

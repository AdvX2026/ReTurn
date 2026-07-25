//
//  ReTurnApp.swift
//  ReTurn
//
//  Created by is52hertz on 7/25/26.
//

import SwiftUI

@main
struct ReTurnApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        #if os(macOS)
        .defaultSize(width: 1100, height: 720)
        .windowResizability(.contentMinSize)
        #endif
    }
}

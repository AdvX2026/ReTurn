//
//  ReTurnApp.swift
//  ReTurn
//
//  Created by is52hertz on 7/25/26.
//

import SwiftUI

@main
struct ReTurnApp: App {
    @State private var stores = AppStores()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(stores.api)
                .environment(stores.timeline)
                .environment(stores.chat)
                .environment(stores.stats)
                .environment(stores.save)
                .environment(stores.cards)
                .environment(stores.tasks)
                .task {
                    if await stores.api.checkConnection() {
                        async let register: Void = stores.api.ensureRegistered()
                        async let stats: Void = stores.stats.refresh()
                        async let history: Void = stores.chat.loadHistory()
                        async let tasks: Void = stores.tasks.refresh()
                        _ = await (register, stats, history, tasks)
                    }
                    await withTaskGroup(of: Void.self) { group in
                        group.addTask { await stores.api.monitorConnection() }
                        group.addTask { await stores.chat.monitor() }
                        group.addTask { await stores.tasks.monitor() }
                        group.addTask { await stores.stats.monitor() }
                    }
                }
        }
        #if os(macOS)
        .defaultSize(width: 1100, height: 720)
        .windowResizability(.contentMinSize)
        #endif

        #if os(macOS)
        Settings {
            APISettingsView()
                .environment(stores.api)
        }
        #endif
    }
}

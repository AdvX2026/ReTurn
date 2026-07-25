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
    #if os(iOS)
    @Environment(\.scenePhase) private var scenePhase
    #endif

    var body: some Scene {
        WindowGroup {
            AppRootView()
                .environment(stores.api)
                .environment(stores.timeline)
                .environment(stores.chat)
                .environment(stores.stats)
                .environment(stores.save)
                .environment(stores.cards)
                .environment(stores.tasks)
                .environment(stores.nodes)
                .environment(stores.search)
                .environment(stores.health)
                .environment(stores.usage)
                .task {
                    if await stores.api.checkConnection() {
                        async let register: Void = stores.api.ensureRegistered()
                        async let stats: Void = stores.stats.refresh()
                        async let history: Void = stores.chat.loadHistory()
                        async let tasks: Void = stores.tasks.refresh()
                        async let outbox: Void = stores.nodes.flushOutbox()
                        _ = await (register, stats, history, tasks, outbox)
                        #if os(iOS)
                        await stores.health.uploadTodayIfPossible()
                        #endif
                    }
                    await withTaskGroup(of: Void.self) { group in
                        group.addTask { await stores.api.monitorConnection() }
                        group.addTask { await stores.chat.monitor() }
                        group.addTask { await stores.tasks.monitor() }
                        group.addTask { await stores.stats.monitor() }
                    }
                }
                #if os(iOS)
                .onChange(of: scenePhase) { _, phase in
                    guard phase == .active else { return }
                    Task {
                        if stores.api.isConnected {
                            await stores.nodes.flushOutbox()
                            await stores.health.uploadTodayIfPossible()
                        }
                    }
                }
                #endif
        }
        #if os(macOS)
        .defaultSize(width: 1100, height: 720)
        .windowResizability(.contentMinSize)
        #endif

        #if os(macOS)
        Settings {
            APISettingsView()
                .environment(stores.api)
                .environment(stores.stats)
                .environment(stores.usage)
                .environment(stores.nodes)
                .environment(stores.health)
        }
        #endif
    }
}

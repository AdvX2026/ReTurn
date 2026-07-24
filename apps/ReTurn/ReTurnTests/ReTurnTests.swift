//
//  ReTurnTests.swift
//  ReTurnTests
//
//  Created by is52hertz on 7/25/26.
//

import CoreFoundation
import Testing
@testable import ReTurn

struct ReTurnTests {
    @Test func timelinePagesMatchTheFigmaNavigationOrder() {
        #expect(TimelinePage.allCases.map(\.rawValue) == ["Before", "Now", "After"])
    }

    @Test func compactChromeUsesAvailableWidthAndExpandsOnFocus() {
        #expect(ReTurnDesign.Layout.navigationWidth(in: 402) == 362)
        #expect(ReTurnDesign.Layout.navigationWidth(in: 440) == 400)
        #expect(
            ReTurnDesign.Layout.composerWidth(in: 440, isFocused: false) == 400
        )
        #expect(
            ReTurnDesign.Layout.composerWidth(in: 440, isFocused: true) == 416
        )
    }

    @Test func regularChromeKeepsAReadableMaximumWidth() {
        #expect(ReTurnDesign.Layout.navigationWidth(in: 1_024) == 520)
        #expect(
            ReTurnDesign.Layout.composerWidth(in: 1_024, isFocused: false) == 640
        )
        #expect(
            ReTurnDesign.Layout.composerWidth(in: 1_024, isFocused: true) == 680
        )
    }
}

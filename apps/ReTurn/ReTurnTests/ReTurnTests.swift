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

    @Test func composerUsesFocusSpecificWidthCapsAndInsets() {
        #expect(ReTurnDesign.Layout.composerMaximumWidth(isFocused: false) == 640)
        #expect(ReTurnDesign.Layout.composerMaximumWidth(isFocused: true) == 680)
        #expect(ReTurnDesign.Layout.composerHorizontalPadding(isFocused: false) == 20)
        #expect(ReTurnDesign.Layout.composerHorizontalPadding(isFocused: true) == 12)
    }

    @Test func mascotWidthStaysWithinItsReadableBounds() {
        #expect(ReTurnDesign.Layout.mascotWidth(in: 300) == 150)
        #expect(ReTurnDesign.Layout.mascotWidth(in: 1_024) == 195)
    }
}

//
//  ReTurnTests.swift
//  ReTurnTests
//
//  Created by is52hertz on 7/25/26.
//

import Testing
@testable import ReTurn

struct ReTurnTests {
    @Test func timelinePagesMatchTheFigmaNavigationOrder() {
        #expect(TimelinePage.allCases.map(\.rawValue) == ["Before", "Now", "After"])
    }
}

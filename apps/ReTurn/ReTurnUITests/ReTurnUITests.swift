//
//  ReTurnUITests.swift
//  ReTurnUITests
//
//  Created by is52hertz on 7/25/26.
//

import XCTest

final class ReTurnUITests: XCTestCase {

    override func setUpWithError() throws {
        // Put setup code here. This method is called before the invocation of each test method in the class.

        // In UI tests it is usually best to stop immediately when a failure occurs.
        continueAfterFailure = false

        // In UI tests it’s important to set the initial state - such as interface orientation - required for your tests before they run. The setUp method is a good place to do this.
    }

    override func tearDownWithError() throws {
        // Put teardown code here. This method is called after the invocation of each test method in the class.
    }

    @MainActor
    func testComposerWalkerAppearsWhileTyping() throws {
        let app = XCUIApplication()
        app.launch()

        let field = app.textFields["Ask Return Anything"]
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        let walker = app.descendants(matching: .any)["ComposerWalker"]
        XCTAssertFalse(walker.exists)

        field.tap()
        XCTAssertTrue(walker.waitForExistence(timeout: 3))
        // Keep a few frames of the pacing as visual evidence.
        for index in 0..<3 {
            if index > 0 { sleep(1) }
            let frame = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
            frame.name = "ComposerWalker-\(index)"
            frame.lifetime = .keepAlways
            add(frame)
        }
        XCTAssertTrue(walker.exists)
    }

    @MainActor
    func testLaunchPerformance() throws {
        // This measures how long it takes to launch your application.
        measure(metrics: [XCTApplicationLaunchMetric()]) {
            XCUIApplication().launch()
        }
    }
}

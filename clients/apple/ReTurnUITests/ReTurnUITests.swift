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
    func testAfterPageCanBeOpened() throws {
        let app = XCUIApplication()
        app.launch()

        let afterButton = app.buttons["After"]
        XCTAssertTrue(afterButton.waitForExistence(timeout: 2))
        afterButton.tap()

        let afterPage = app.descendants(matching: .any)["after.page"]
        XCTAssertTrue(afterPage.waitForExistence(timeout: 2))
    }

    @MainActor
    func testNowMascotUsesNativeButton() throws {
        let app = XCUIApplication()
        app.launch()

        let mascot = app.buttons["NowMascot"]
        XCTAssertTrue(mascot.waitForExistence(timeout: 2))
        XCTAssertTrue(mascot.isHittable)
        mascot.tap()
    }

    /// Launches once per emote kind with MASCOT_EMOTE pinning the idle
    /// burst, then captures frames across the first one as visual evidence.
    @MainActor
    func testMascotEmotes() throws {
        for kind in ["wave", "cheer", "twirl"] {
            let app = XCUIApplication()
            app.launchEnvironment["MASCOT_EMOTE"] = kind
            app.launch()
            XCTAssertTrue(app.staticTexts["Teethe is back!"].waitForExistence(timeout: 5))
            // The emote check fires 6 s after the mascot appears; spread
            // frames over the following seconds to land mid-burst.
            sleep(6)
            for index in 0..<5 {
                if index > 0 { usleep(500_000) }
                let frame = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
                frame.name = "\(kind)-\(index)"
                frame.lifetime = .keepAlways
                add(frame)
            }
            app.terminate()
        }
    }

    @MainActor
    func testLaunchPerformance() throws {
        // This measures how long it takes to launch your application.
        measure(metrics: [XCTApplicationLaunchMetric()]) {
            XCUIApplication().launch()
        }
    }
}

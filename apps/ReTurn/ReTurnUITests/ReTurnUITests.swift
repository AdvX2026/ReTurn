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
    func testAfterPage() throws {
        let app = XCUIApplication()
        app.launch()

        let afterButton = app.buttons["After"]
        XCTAssertTrue(afterButton.waitForExistence(timeout: 2))
        afterButton.tap()

        XCTAssertTrue(app.buttons["after.todo.open"].waitForExistence(timeout: 2))
        XCTAssertTrue(app.buttons["after.todo.accept.0"].exists)
        XCTAssertTrue(app.buttons["after.health.open"].exists)

        let topScreenshot = XCTAttachment(screenshot: app.screenshot())
        topScreenshot.name = "After page top"
        topScreenshot.lifetime = .keepAlways
        add(topScreenshot)

        let afterPage = app.scrollViews["after.page"]
        XCTAssertTrue(afterPage.waitForExistence(timeout: 2))

        let initialTodoY = app.buttons["after.todo.open"].frame.minY
        afterPage.swipeUp()
        XCTAssertLessThan(app.buttons["after.todo.open"].frame.minY, initialTodoY)

        let userIdea = app.buttons["after.idea.user"]
        scrollToHittable(userIdea, in: afterPage)

        let automaticIdea = app.buttons["after.idea.auto"]
        scrollToHittable(automaticIdea, in: afterPage)

        let ideasScreenshot = XCTAttachment(screenshot: app.screenshot())
        ideasScreenshot.name = "After page ideas"
        ideasScreenshot.lifetime = .keepAlways
        add(ideasScreenshot)
    }

    @MainActor
    private func scrollToHittable(
        _ element: XCUIElement,
        in scrollView: XCUIElement
    ) {
        for _ in 0..<4 {
            guard !element.isHittable else { break }
            scrollView.swipeUp()
        }

        XCTAssertTrue(element.waitForExistence(timeout: 2))
        XCTAssertTrue(element.isHittable)
    }

    @MainActor
    func testLaunchPerformance() throws {
        // This measures how long it takes to launch your application.
        measure(metrics: [XCTApplicationLaunchMetric()]) {
            XCUIApplication().launch()
        }
    }
}

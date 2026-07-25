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

        let todoCard = app.buttons["after.todo.open"]
        XCTAssertTrue(todoCard.waitForExistence(timeout: 2))
        XCTAssertFalse(todoCard.isEnabled)

        let acceptButton = app.buttons["after.todo.accept.0"]
        XCTAssertTrue(acceptButton.exists)
        XCTAssertFalse(acceptButton.isEnabled)

        let healthCard = app.buttons["after.health.open"]
        XCTAssertTrue(healthCard.exists)
        XCTAssertFalse(healthCard.isEnabled)

        let topScreenshot = XCTAttachment(screenshot: app.screenshot())
        topScreenshot.name = "After page top"
        topScreenshot.lifetime = .keepAlways
        add(topScreenshot)

        let afterPage = app.scrollViews["after.page"]
        XCTAssertTrue(afterPage.waitForExistence(timeout: 2))

        let initialTodoY = todoCard.frame.minY
        afterPage.swipeUp()
        XCTAssertLessThan(todoCard.frame.minY, initialTodoY)

        let userIdea = app.buttons["after.idea.user"]
        scrollToVisible(userIdea, in: afterPage)
        XCTAssertFalse(userIdea.isEnabled)

        let automaticIdea = app.buttons["after.idea.auto"]
        scrollToVisible(automaticIdea, in: afterPage)
        XCTAssertFalse(automaticIdea.isEnabled)

        let ideasScreenshot = XCTAttachment(screenshot: app.screenshot())
        ideasScreenshot.name = "After page ideas"
        ideasScreenshot.lifetime = .keepAlways
        add(ideasScreenshot)
    }

    @MainActor
    private func scrollToVisible(
        _ element: XCUIElement,
        in scrollView: XCUIElement
    ) {
        for _ in 0..<4 {
            if element.exists, scrollView.frame.intersects(element.frame) {
                break
            }
            scrollView.swipeUp()
        }

        XCTAssertTrue(element.waitForExistence(timeout: 2))
        XCTAssertTrue(scrollView.frame.intersects(element.frame))
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

    @MainActor
    func testLaunchPerformance() throws {
        // This measures how long it takes to launch your application.
        measure(metrics: [XCTApplicationLaunchMetric()]) {
            XCUIApplication().launch()
        }
    }
}

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

    @Test func afterPreviewCoversEveryAfterCardVariant() {
        #expect(
            AfterPreviewData.todoSuggestion.todos.count
                == AfterPreviewData.todoSuggestion.todoIds.count
        )
        #expect(AfterPreviewData.health.sleepMinutes != nil)
        #expect(AfterPreviewData.health.steps != nil)
        #expect(AfterPreviewData.ideas.map(\.provenance) == [.user, .auto])
    }

    @MainActor
    @Test func todoSuggestionsRequireStableIDsBeforeAcceptance() {
        let card = TodoSuggestionCard(
            content: TodoSuggestionCardContent(
                todos: ["Has ID", "Missing ID", "Empty ID"],
                todoIds: ["todo-1", ""]
            )
        )

        #expect(card.todoID(at: 0) == "todo-1")
        #expect(card.todoID(at: 1) == nil)
        #expect(card.todoID(at: 2) == nil)
    }

    #if os(iOS)
    @Test func nowPreviewHighlightsOneStatAtATime() {
        #expect(
            NowPreviewData.demoLineup.map(\.profession)
                == MascotProfession.allCases
        )
        #expect(
            NowPreviewData.demoLineup.map(\.highlightedStat)
                == ["intake", "focus", "output", "continuity", "energy"]
        )
        #expect(
            NowPreviewData.demoLineup.map(\.stats)
                == [
                    Stats(intake: 95, focus: 10, output: 10, continuity: 10, energy: 55),
                    Stats(intake: 10, focus: 95, output: 10, continuity: 10, energy: 55),
                    Stats(intake: 10, focus: 10, output: 95, continuity: 10, energy: 55),
                    Stats(intake: 10, focus: 10, output: 10, continuity: 95, energy: 55),
                    Stats(intake: 10, focus: 10, output: 10, continuity: 10, energy: 95),
                ]
        )
    }
    #endif
}

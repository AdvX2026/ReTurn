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

    @MainActor
    @Test func cancellingAnIdleVoiceRecorderIsIdempotent() {
        let recorder = VoiceRecorder()

        recorder.cancel()
        recorder.cancel()

        #expect(recorder.isRecording == false)
    }

    #if os(iOS)
    @MainActor
    @Test func sharedProfessionsMapToMascotPresentationVariants() {
        #expect(
            [Profession.coder, .writer, .designer, .explorer, .communicator, .generalist]
                .map(MascotProfession.init)
                == [
                    .coder,
                    .writer,
                    .designer,
                    .researcher,
                    .manager,
                    .generalist,
                ]
        )
    }
    #endif
}

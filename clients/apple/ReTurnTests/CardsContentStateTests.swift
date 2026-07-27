import Foundation
import Testing
@testable import ReTurn

@MainActor
struct CardsContentStateTests {
    @Test func refreshPreservesLoadedPagesCursorAndLocalOutcomes() throws {
        var state = CardsContentState()
        state.applyRefresh(
            .init(
                direction: .future,
                cards: [try card(id: "first", todoID: "todo-first")],
                nextCursor: "first-page"
            )
        )
        state.applyNextPage(
            .init(
                direction: .future,
                cards: [try card(id: "tail", todoID: "todo-tail")],
                nextCursor: "deep-page"
            )
        )
        state.markTodoDone("todo-tail")
        state.markTodoDismissed("todo-tail")
        state.recordTodoError("Retry later", for: "todo-tail")

        state.applyRefresh(
            .init(
                direction: .future,
                cards: [try card(id: "new", todoID: "todo-new")],
                nextCursor: "new-first-page"
            )
        )

        #expect(state.cards.map(\.id) == ["new", "tail"])
        #expect(state.nextCursor == "deep-page")
        #expect(state.doneTodoIDs == ["todo-tail"])
        #expect(state.dismissedTodoIDs == ["todo-tail"])
        #expect(state.todoErrors == ["todo-tail": "Retry later"])
    }

    @Test func refreshReplacesTheFirstPageBeforePagination() throws {
        var state = CardsContentState()
        state.applyRefresh(
            .init(
                direction: .future,
                cards: [try card(id: "old", todoID: "todo-old")],
                nextCursor: "old-cursor"
            )
        )
        state.markTodoDone("todo-old")

        state.applyRefresh(
            .init(
                direction: .future,
                cards: [try card(id: "new", todoID: "todo-new")],
                nextCursor: "new-cursor"
            )
        )

        #expect(state.cards.map(\.id) == ["new"])
        #expect(state.nextCursor == "new-cursor")
        #expect(state.doneTodoIDs.isEmpty)
    }

    @Test func emptyAdditionalPageStillPreservesTheAdvancedCursor() throws {
        var state = CardsContentState()
        state.applyRefresh(
            .init(
                direction: .future,
                cards: [try card(id: "first", todoID: "todo-first")],
                nextCursor: "page-two"
            )
        )
        state.applyNextPage(
            .init(direction: .future, cards: [], nextCursor: "page-three")
        )

        state.applyRefresh(
            .init(
                direction: .future,
                cards: [try card(id: "first", todoID: "todo-first")],
                nextCursor: "page-two"
            )
        )

        #expect(state.nextCursor == "page-three")
    }

    @Test func todoAcceptanceGateRejectsASecondInFlightRequest() {
        var state = CardsContentState()

        let firstAttempt = state.beginAcceptingTodo("todo-1")
        let overlappingAttempt = state.beginAcceptingTodo("todo-1")
        #expect(firstAttempt)
        #expect(overlappingAttempt == false)

        state.endAcceptingTodo("todo-1")

        let retry = state.beginAcceptingTodo("todo-1")
        #expect(retry)
    }

    private func card(id: String, todoID: String) throws -> CardRecord {
        let data = try JSONSerialization.data(
            withJSONObject: [
                "id": id,
                "type": "todo_suggestion",
                "date": "2026-07-25",
                "content": ["todos": ["Do it"], "todo_ids": [todoID]],
                "created_at": "2026-07-25T10:00:00.000Z",
            ]
        )
        return try ReTurnAPI.makeDecoder().decode(CardRecord.self, from: data)
    }
}

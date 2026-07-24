//
//  ModelsTests.swift
//  ReTurnTests
//
//  Decode tests for the shared-contract mirror: snake_case mapping,
//  tolerant enum fallback, and CardRecord's per-type content decoding.
//

import Foundation
import Testing
@testable import ReTurn

struct ModelsTests {
    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try ReTurnAPI.makeDecoder().decode(type, from: Data(json.utf8))
    }

    @Test func decodesChatResponseSnakeCase() throws {
        let json = """
        {
          "message_id": "9c5c9e59-0000-4000-8000-000000000001",
          "user_message_id": "9c5c9e59-0000-4000-8000-000000000002",
          "intent": "retrieval",
          "confidence": 0.92,
          "reply": "找到了",
          "jump": { "date": "2026-07-24", "node_ids": ["9c5c9e59-0000-4000-8000-000000000003"] }
        }
        """
        let res = try decode(ChatResponse.self, json)
        #expect(res.intent == .retrieval)
        #expect(res.jump?.date == "2026-07-24")
        #expect(res.jump?.nodeIds.count == 1)
        #expect(res.taskId == nil)
    }

    @Test func unknownEnumValuesFallBackInsteadOfThrowing() throws {
        // Future backend adds NodeKind "email" (open PR): old builds must not crash.
        let json = """
        {
          "id": "9c5c9e59-0000-4000-8000-000000000001",
          "day_id": "9c5c9e59-0000-4000-8000-000000000002",
          "device_id": null,
          "kind": "email",
          "title": null,
          "content": null,
          "source_meta": { "from": "a@b.c", "count": 3 },
          "client_uuid": "9c5c9e59-0000-4000-8000-000000000004",
          "created_at": "2026-07-25T10:00:00.000Z",
          "date": "2026-07-25"
        }
        """
        let node = try decode(NodeRecord.self, json)
        #expect(node.kind == .unknown)
        #expect(node.sourceMeta?["count"] == .number(3))
    }

    @Test func decodesTypedCardContentByType() throws {
        let json = """
        {
          "direction": "future",
          "next_cursor": null,
          "cards": [
            {
              "id": "9c5c9e59-0000-4000-8000-000000000001",
              "type": "health",
              "date": "2026-07-25",
              "created_at": "2026-07-25T07:00:00.000Z",
              "content": { "advice": "早点睡", "sleep_minutes": 312, "steps": 4200 }
            },
            {
              "id": "9c5c9e59-0000-4000-8000-000000000002",
              "type": "idea",
              "date": "2026-07-25",
              "created_at": "2026-07-25T07:00:00.000Z",
              "content": {
                "text": "做一个时间流",
                "node_ids": ["9c5c9e59-0000-4000-8000-000000000003"],
                "provenance": "user"
              }
            }
          ]
        }
        """
        let res = try decode(ListCardsResponse.self, json)
        #expect(res.direction == .future)
        guard case .health(let health) = res.cards[0].content else {
            Issue.record("expected typed health content")
            return
        }
        #expect(health.sleepMinutes == 312)
        guard case .idea(let idea) = res.cards[1].content else {
            Issue.record("expected typed idea content")
            return
        }
        #expect(idea.provenance == .user)
    }

    @Test func malformedCardContentFallsBackToRaw() throws {
        // Unknown card type / shape drift must degrade to .raw, not fail the list.
        let json = """
        {
          "id": "9c5c9e59-0000-4000-8000-000000000001",
          "type": "weekly",
          "date": "2026-07-25",
          "created_at": "2026-07-25T07:00:00.000Z",
          "content": { "narrative": "本周写了很多代码" }
        }
        """
        let card = try decode(CardRecord.self, json)
        #expect(card.type == .unknown)
        guard case .raw(let raw) = card.content else {
            Issue.record("expected raw fallback content")
            return
        }
        #expect(raw["narrative"] == .string("本周写了很多代码"))
    }

    @Test func encodesRequestsAsSnakeCase() throws {
        let req = CreateNodesRequest(
            deviceId: "9c5c9e59-0000-4000-8000-000000000001",
            nodes: [
                NodeInput(
                    clientUuid: "9c5c9e59-0000-4000-8000-000000000002",
                    kind: .idea,
                    title: nil,
                    content: "灵感",
                    sourceMeta: ["provenance": .string("user")],
                    clientCreatedAt: nil,
                    date: nil
                )
            ]
        )
        let data = try ReTurnAPI.makeEncoder().encode(req)
        let obj = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        #expect(obj["device_id"] != nil)
        let nodes = try #require(obj["nodes"] as? [[String: Any]])
        #expect(nodes[0]["client_uuid"] != nil)
        #expect(nodes[0]["kind"] as? String == "idea")
    }

    @Test func parsesServerTimestamps() {
        #expect(ReTurnAPI.parseDate("2026-07-25T10:00:00.123Z") != nil)
        #expect(ReTurnAPI.parseDate("2026-07-25T10:00:00Z") != nil)
    }
}

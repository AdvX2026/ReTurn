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

    @Test func nodeKindsStayAlignedAndFutureValuesRemainSafe() throws {
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
        #expect(node.kind == .email)
        #expect(node.sourceMeta?["count"] == .number(3))

        let future = json.replacingOccurrences(of: "\"email\"", with: "\"calendar_event\"")
        #expect(try decode(NodeRecord.self, future).kind == .unknown)
    }

    @Test func decodesCollectionAndProviderUsage() throws {
        let stats = try decode(
            StatsTodayResponse.self,
            """
            {
              "date": "2026-07-25",
              "stats": {"intake": 1, "focus": 2, "output": 3, "continuity": 4, "energy": 5},
              "character_state": "normal",
              "saved": false,
              "collection": {"device_count": 2, "sample_count": 18, "last_seen_at": "2026-07-25T10:00:00.000Z"},
              "cadence": "active",
              "profession": "coder",
              "profession_mode": "auto"
            }
            """
        )
        #expect(stats.collection.sampleCount == 18)

        let usage = try decode(
            UsageResponse.self,
            """
            {
              "from": "2026-07-01",
              "to": "2026-07-25",
              "totals": {"calls": 2, "succeeded": 1, "failed": 1, "prompt_tokens": 20, "completion_tokens": 10, "total_tokens": 30},
              "breakdown": [
                {"kind": "llm", "operation": "ask", "model": "demo", "calls": 2, "succeeded": 1, "failed": 1, "prompt_tokens": 20, "completion_tokens": 10, "total_tokens": 30}
              ]
            }
            """
        )
        #expect(usage.totals.failed == 1)
        #expect(usage.breakdown.first?.operation == "ask")
    }

    @MainActor
    @Test func decodesUserProfileSnakeCase() throws {
        let profile = try decode(
            UserProfile.self,
            """
            {
              "display_name": "Teethe",
              "profession": "coder",
              "profession_mode": "manual",
              "note": "Prefer deep work",
              "last_inferred_profession": "writer",
              "accepted_todos": ["Ship profile API"],
              "dismissed_todos": [],
              "updated_at": "2026-07-25T12:00:00.000Z"
            }
            """
        )

        #expect(profile.displayName == "Teethe")
        #expect(profile.profession == .coder)
        #expect(profile.professionMode == .manual)
        #expect(profile.lastInferredProfession == .writer)
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
            },
            {
              "id": "9c5c9e59-0000-4000-8000-000000000010",
              "type": "briefing",
              "date": "2026-07-24",
              "created_at": "2026-07-24T22:00:00.000Z",
              "content": {
                "summary": "写了一天代码",
                "opening_line": "辛苦了",
                "briefing": "写了一天代码",
                "review_points": [{"text": "推进了时间线", "kind": "win"}],
                "stats": {"intake": 40, "focus": 70, "output": 55, "continuity": 10, "energy": 60},
                "character_state": "focused",
                "node_ids": ["9c5c9e59-0000-4000-8000-000000000003"],
                "profession": "coder",
                "streak": 3,
                "breakdown": {
                  "idea_count": 2,
                  "image_count": 1,
                  "active_feed_count": 5,
                  "email_received": 0,
                  "todo_completed": 6,
                  "todo_total": 17,
                  "agent_duration_min": 120,
                  "git_commit_count": 4,
                  "email_sent": 0,
                  "longest_session_min": 90,
                  "sleep_minutes": 300,
                  "steps": 4000,
                  "cross_day_edges": 1
                }
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
        guard case .briefing(let brief) = res.cards[2].content else {
            Issue.record("expected typed briefing content")
            return
        }
        #expect(brief.profession == .coder)
        #expect(brief.streak == 3)
        #expect(brief.breakdown.todoCompleted == 6)
        #expect(brief.breakdown.agentDurationMin == 120)
    }

    @Test func decodesTimelineSegmentProjection() throws {
        let json = """
        {
          "date": "2026-07-24",
          "segments": [
            {
              "id": "9c5c9e59-0000-4000-8000-000000000001",
              "kind": "briefing",
              "shape": "point",
              "importance": "major",
              "role": "derived",
              "start": "2026-07-24T22:00:00.000Z",
              "end": "2026-07-24T22:00:00.000Z",
              "label": "Daily Briefing",
              "date": "2026-07-24",
              "destination": {
                "type": "daily_briefing",
                "briefing_id": "9c5c9e59-0000-4000-8000-000000000010"
              }
            },
            {
              "id": "9c5c9e59-0000-4000-8000-000000000002",
              "kind": "cluster",
              "shape": "span",
              "importance": "normal",
              "start": "2026-07-24T10:00:00.000Z",
              "end": "2026-07-24T10:20:00.000Z",
              "label": "4 text",
              "cluster_id": "9c5c9e59-0000-4000-8000-000000000002",
              "child_count": 4,
              "child_ids": ["a", "b", "c", "d"],
              "children": [
                {
                  "id": "a",
                  "label": "note 0",
                  "start": "2026-07-24T10:00:00.000Z"
                }
              ],
              "destination": {
                "type": "timeline_cluster",
                "cluster_id": "9c5c9e59-0000-4000-8000-000000000002"
              }
            }
          ]
        }
        """
        let tl = try decode(TimelineResponse.self, json)
        #expect(tl.segments.count == 2)
        #expect(tl.segments[0].kind == .briefing)
        #expect(tl.segments[0].destination?.type == .dailyBriefing)
        #expect(tl.segments[0].destination?.briefingId == "9c5c9e59-0000-4000-8000-000000000010")
        #expect(tl.segments[1].kind == .cluster)
        #expect(tl.segments[1].childCount == 4)
        #expect(tl.segments[1].children?.first?.label == "note 0")
    }

    @MainActor
    @Test func weeklyCardContentDecodes() throws {
        let json = """
        {
          "id": "9c5c9e59-0000-4000-8000-000000000001",
          "type": "weekly",
          "date": "2026-07-26",
          "created_at": "2026-07-26T14:00:00.000Z",
          "content": {
            "week_start": "2026-07-20",
            "week_end": "2026-07-26",
            "summary": "本周写了很多代码",
            "opening_line": "主线向前。",
            "highlights": [{"text": "Shipped weekly", "kind": "win"}],
            "day_dates": ["2026-07-26"],
            "stats_avg": {
              "intake": 40, "focus": 50, "output": 60, "continuity": 10, "energy": 80
            },
            "profession": "coder"
          }
        }
        """
        let card = try decode(CardRecord.self, json)
        #expect(card.type == .weekly)
        guard case .weekly(let content) = card.content else {
            Issue.record("expected weekly content")
            return
        }
        #expect(content.weekStart == "2026-07-20")
        #expect(content.weekEnd == "2026-07-26")
        #expect(content.profession == .coder)
        #expect(content.highlights.count == 1)
    }

    @Test func malformedCardContentFallsBackToRaw() throws {
        // Unknown card type / shape drift must degrade to .raw, not fail the list.
        let json = """
        {
          "id": "9c5c9e59-0000-4000-8000-000000000001",
          "type": "totally_new_card",
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

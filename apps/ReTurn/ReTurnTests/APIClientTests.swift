//
//  APIClientTests.swift
//  ReTurnTests
//

import Foundation
import Testing
@testable import ReTurn

struct APIClientTests {
    @Test func multipartBodyIsWellFormed() throws {
        let body = APIClient.multipartBody(
            boundary: "B",
            fields: ["device_id": "dev-1"],
            fileField: "file",
            filename: "note.m4a",
            mimeType: "audio/m4a",
            fileData: Data([0x01, 0x02])
        )
        let text = String(decoding: body, as: UTF8.self)
        #expect(text.contains("--B\r\nContent-Disposition: form-data; name=\"device_id\"\r\n\r\ndev-1\r\n"))
        #expect(text.contains("name=\"file\"; filename=\"note.m4a\"\r\n"))
        #expect(text.contains("Content-Type: audio/m4a\r\n\r\n"))
        #expect(text.hasSuffix("\r\n--B--\r\n"))
    }

    @Test func decodesFastifyErrorBody() throws {
        let json = """
        { "statusCode": 400, "error": "Bad Request", "message": "q is required" }
        """
        let body = try ReTurnAPI.makeDecoder().decode(APIErrorBody.self, from: Data(json.utf8))
        #expect(body.statusCode == 400)
        #expect(body.message == "q is required")
        #expect(APIError.http(status: 400, message: body.message).errorDescription == "q is required")
    }
}

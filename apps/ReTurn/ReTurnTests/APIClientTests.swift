//
//  APIClientTests.swift
//  ReTurnTests
//

import Foundation
import Testing
@testable import ReTurn

struct APIClientTests {
    @Test func listCardsCapsLimitAtServerMaximum() async throws {
        RequestCapturingURLProtocol.reset()
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [RequestCapturingURLProtocol.self]
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }

        let client = APIClient(
            baseURL: try #require(URL(string: "http://localhost")),
            apiToken: nil,
            session: session
        )

        _ = try await client.listCards(direction: .before, limit: 100)

        let request = try #require(RequestCapturingURLProtocol.capturedRequest())
        let components = try #require(URLComponents(url: request.url!, resolvingAgainstBaseURL: false))
        let limit = components.queryItems?.first { $0.name == "limit" }?.value
        #expect(limit == "50")
    }

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

private final class RequestCapturingURLProtocol: URLProtocol {
    private static let lock = NSLock()
    nonisolated(unsafe) private static var request: URLRequest?

    static func reset() {
        lock.lock()
        request = nil
        lock.unlock()
    }

    static func capturedRequest() -> URLRequest? {
        lock.lock()
        defer { lock.unlock() }
        return request
    }

    override class func canInit(with request: URLRequest) -> Bool { true }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.lock.lock()
        Self.request = request
        Self.lock.unlock()

        let data = Data(
            #"{"direction":"before","cards":[],"next_cursor":null}"#.utf8
        )
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: 200,
            httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

import SwiftUI

/// Lightweight search + ask surface for GET /api/search and POST /api/ask.
/// Retrieval jumps reuse TimelineStore.focusRequest the same way chat F10 does.
struct SearchSheet: View {
    @Environment(APIEnvironment.self) private var api: APIEnvironment
    @Environment(SearchStore.self) private var search: SearchStore
    @Environment(TimelineStore.self) private var timeline: TimelineStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        @Bindable var search = search
        NavigationStack {
            List {
                Section {
                    TextField("Search or ask…", text: $search.query)
                        .textFieldStyle(.roundedBorder)
                        .onSubmit { Task { await search.search() } }

                    HStack {
                        Button("Search") {
                            Task { await search.search() }
                        }
                        .disabled(!api.isConnected || search.query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || search.isSearching)

                        Button("Ask") {
                            Task { await search.ask() }
                        }
                        .disabled(!api.isConnected || search.query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || search.isAsking)

                        if search.isSearching || search.isAsking {
                            ProgressView().controlSize(.small)
                        }
                    }
                }

                if let error = search.lastError {
                    Section {
                        Text(error).foregroundStyle(.red)
                    }
                }

                if let answer = search.answer {
                    Section("Answer") {
                        Text(answer.answer)
                        if !answer.citations.isEmpty {
                            ForEach(Array(answer.citations.enumerated()), id: \.offset) { _, cite in
                                Button {
                                    jump(date: cite.date, nodeID: cite.nodeId)
                                } label: {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(cite.title ?? cite.kind)
                                            .font(.subheadline.weight(.medium))
                                        Text(cite.snippet)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                            .lineLimit(2)
                                    }
                                }
                            }
                        }
                    }
                }

                if !search.hits.isEmpty {
                    Section("Hits") {
                        ForEach(Array(search.hits.enumerated()), id: \.offset) { _, hit in
                            Button {
                                let date = hit.node?.date ?? hit.day?.date
                                guard let date else { return }
                                jump(date: date, nodeID: hit.node?.id)
                            } label: {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(hit.node?.title ?? hit.day?.summary ?? hit.kind)
                                        .font(.subheadline.weight(.medium))
                                    Text(hit.snippet)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                        .lineLimit(2)
                                    Text(hit.node?.date ?? hit.day?.date ?? hit.docId)
                                        .font(.caption2)
                                        .foregroundStyle(.tertiary)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Search")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") {
                        search.clear()
                        dismiss()
                    }
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 420, minHeight: 480)
        #endif
    }

    private func jump(date: String, nodeID: String?) {
        timeline.requestFocus(dayKey: date, nodeID: nodeID)
        search.clear()
        dismiss()
    }
}

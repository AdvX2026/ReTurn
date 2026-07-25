#if os(iOS)
enum NowPreviewData {
    struct MascotDemo {
        let profession: MascotProfession
        let highlightedStat: String
        let stats: Stats
    }

    /// Temporary presentation data until the Now page receives real stats and
    /// a server-assigned profession.
    static let demoLineup: [MascotDemo] = [
        MascotDemo(
            profession: .coder,
            highlightedStat: "intake",
            stats: Stats(
                intake: 95,
                focus: 10,
                output: 10,
                continuity: 10,
                energy: 55
            )
        ),
        MascotDemo(
            profession: .writer,
            highlightedStat: "focus",
            stats: Stats(
                intake: 10,
                focus: 95,
                output: 10,
                continuity: 10,
                energy: 55
            )
        ),
        MascotDemo(
            profession: .designer,
            highlightedStat: "output",
            stats: Stats(
                intake: 10,
                focus: 10,
                output: 95,
                continuity: 10,
                energy: 55
            )
        ),
        MascotDemo(
            profession: .researcher,
            highlightedStat: "continuity",
            stats: Stats(
                intake: 10,
                focus: 10,
                output: 10,
                continuity: 95,
                energy: 55
            )
        ),
        MascotDemo(
            profession: .manager,
            highlightedStat: "energy",
            stats: Stats(
                intake: 10,
                focus: 10,
                output: 10,
                continuity: 10,
                energy: 95
            )
        ),
    ]
}
#endif

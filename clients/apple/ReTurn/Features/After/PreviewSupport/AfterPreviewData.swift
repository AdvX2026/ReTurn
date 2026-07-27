enum AfterPreviewData {
    static let todoSuggestion = TodoSuggestionCardContent(
        todos: [
            "跟后端确认职业字段",
            "定下 Before 时间线的色板",
            "给卡片外壳补测试",
        ],
        todoIds: [
            "todo-profession-contract",
            "todo-before-palette",
            "todo-card-tests",
        ]
    )

    static let health = HealthCardContent(
        advice: "昨晚睡了 6 小时 48 分，比平时少 1 小时。",
        sleepMinutes: 408,
        steps: 8_832
    )

    static let ideas = [
        IdeaCardContent(
            text: "卡片是总结层，时间线是明细层，两者靠「点进去」连接。",
            nodeIds: ["idea-user-card-timeline"],
            provenance: .user
        ),
        IdeaCardContent(
            text: "连续三天都在下午写代码、晚上做设计，也许可以把设计固定排在晚上。",
            nodeIds: ["idea-auto-evening-design"],
            provenance: .auto
        ),
    ]
}

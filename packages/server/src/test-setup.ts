import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Loaded via `node --import` BEFORE any app modules so config snapshots are correct.
 * - HEALTH_TOKEN: required for /api/health smoke (no weak default in app config)
 * - LLM_API_KEY: required at startup; chat completion is mocked below
 */
if (!process.env.HEALTH_TOKEN) {
  process.env.HEALTH_TOKEN = "test-health-token";
}
if (!process.env.LLM_API_KEY) {
  process.env.LLM_API_KEY = "test-llm-key";
}
if (!process.env.WHISPER_BASE_URL) {
  process.env.WHISPER_BASE_URL = "https://whisper.test/v1";
}
if (!process.env.WHISPER_API_KEY) {
  process.env.WHISPER_API_KEY = "test-whisper-key";
}
if (!process.env.EMBEDDING_BASE_URL) {
  process.env.EMBEDDING_BASE_URL = "https://embedding.test/v1";
}
if (!process.env.EMBEDDING_API_KEY) {
  process.env.EMBEDDING_API_KEY = "test-embedding-key";
}
if (!process.env.EMBEDDING_MODEL) {
  process.env.EMBEDDING_MODEL = "test-embedding-model";
}
if (!process.env.DATA_DIR) {
  process.env.DATA_DIR = join(tmpdir(), `return-server-test-${process.pid}`);
}

const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  if (String(input).endsWith("/audio/transcriptions")) {
    return new Response(
      JSON.stringify({
        text: "Mock voice transcript",
        usage: { total_tokens: 17 },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
  if (String(input).endsWith("/embeddings")) {
    const body = JSON.parse(String(init?.body)) as { input: string[] };
    return new Response(
      JSON.stringify({
        data: body.input.map((_, index) => ({
          index,
          embedding: [1, index + 1, 0.5],
        })),
        usage: {
          prompt_tokens: body.input.length * 4,
          total_tokens: body.input.length * 4,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
  if (String(input).endsWith("/chat/completions")) {
    const body = JSON.parse(String(init?.body)) as {
      messages: Array<{ role: string; content: unknown }>;
    };
    const system = String(body.messages[0]?.content ?? "");
    const userContent = body.messages[1]?.content;
    const user =
      typeof userContent === "string" ? userContent : JSON.stringify(userContent ?? "");

    let content: string;
    if (system.includes("intent classifier")) {
      const intent = /灵感|idea/i.test(user)
        ? "idea"
        : /搜|找|search|find/i.test(user)
          ? "retrieval"
          : "question";
      content = JSON.stringify({ intent, confidence: 0.95 });
    } else if (system.includes("organize meeting notes")) {
      content = JSON.stringify({
        title: "HTTP Task 测试",
        summary: "测试会议纪要已整理。",
        decisions: ["使用持久化队列"],
        action_items: ["验证完成消息"],
      });
    } else if (system.includes("personal memory assistant")) {
      const citation = user.match(/id=([^ ]+)/)?.[1];
      content = citation ? `找到相关记录 [${citation}]` : "没在你的记录里找到相关内容。";
    } else if (system.includes("灵感记录")) {
      content = "已记下这条灵感，可以继续补充下一步。";
    } else if (system.includes("刚才在忙什么")) {
      content = "你刚才主要在推进 ReTurn。";
    } else if (system.includes("提取图片")) {
      content = "图片中的测试笔记。";
    } else {
      content = JSON.stringify({
        summary: "Test day summary.",
        opening_line: "Start the next day with one clear step.",
        briefing: "Test day briefing.",
        review_points: [{ text: "Captured useful work.", kind: "win" }],
        todos: [
          { text: "Finish the timeline" },
          { text: "Prepare the demo" },
          { text: "Review the pitch" },
        ],
        health_advice: null,
        ideas: [],
        node_tags: {},
        edges: [],
      });
    }
    return new Response(
      JSON.stringify({
        choices: [{ message: { content } }],
        usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
  return realFetch(input, init);
};

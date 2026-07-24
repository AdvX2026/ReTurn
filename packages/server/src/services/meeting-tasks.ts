import type { TaskRecord } from "@return/shared";
import { z } from "zod";
import {
  type MeetingNotesResult,
  formatMeetingNotesContent,
  organizeMeetingNotes,
} from "../ai/meeting-notes.js";
import {
  claimNextMeetingTask,
  getTask,
  insertMessage,
  insertNode,
  requeueRunningMeetingTasks,
  updateTask,
} from "../db/repo.js";
import type { Db } from "../db/schema.js";
import { nowIso, todayDate } from "../util/time.js";

const MeetingTaskInput = z.object({
  text: z.string().min(1).max(8000),
  device_id: z.string().uuid().nullable().optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type MeetingNotesProcessor = (text: string) => Promise<MeetingNotesResult>;

export interface MeetingTaskDispatcher {
  wake(): void;
}

export class MeetingTaskRunner implements MeetingTaskDispatcher {
  private started = false;
  private closing = false;
  private rerun = false;
  private work: Promise<void> | null = null;

  constructor(
    private readonly db: Db,
    private readonly processor: MeetingNotesProcessor = organizeMeetingNotes,
  ) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    requeueRunningMeetingTasks(this.db);
    this.kick();
  }

  wake(): void {
    if (!this.started) {
      throw new Error("meeting task runner not started");
    }
    this.kick();
  }

  async waitForIdle(): Promise<void> {
    while (this.work) {
      await this.work;
    }
  }

  async close(): Promise<void> {
    this.closing = true;
    await this.waitForIdle();
  }

  private kick(): void {
    if (this.closing) return;
    if (this.work) {
      this.rerun = true;
      return;
    }
    this.work = new Promise<void>((resolve) => setTimeout(resolve, 0))
      .then(() => this.drain())
      .catch((err) => {
        console.error(
          "[meeting-task] runner failed:",
          err instanceof Error ? err.message : err,
        );
      })
      .finally(() => {
        this.work = null;
        if (this.rerun && !this.closing) {
          this.rerun = false;
          this.kick();
        }
      });
  }

  private async drain(): Promise<void> {
    while (!this.closing) {
      const task = claimNextMeetingTask(this.db);
      if (!task) return;
      await this.process(task);
    }
  }

  private async process(task: TaskRecord): Promise<void> {
    const input = MeetingTaskInput.safeParse(task.input);
    if (!input.success) {
      this.persistFailure(task, "", null, "invalid persisted task input");
      return;
    }

    try {
      const result = await this.processor(input.data.text);
      this.persistSuccess(
        task,
        input.data.text,
        input.data.device_id ?? null,
        input.data.date ?? todayDate(),
        result,
      );
    } catch (err) {
      console.warn(
        `[meeting-task] ${task.id} extraction failed:`,
        err instanceof Error ? err.message : err,
      );
      this.persistFailure(
        task,
        input.data.text,
        input.data.device_id ?? null,
        "automatic organization failed",
        input.data.date,
      );
    }
  }

  private persistSuccess(
    task: TaskRecord,
    rawText: string,
    deviceId: string | null,
    date: string,
    result: MeetingNotesResult,
  ): void {
    this.db.transaction(() => {
      if (getTask(this.db, task.id)?.status !== "running") return;
      const { node } = insertNode(this.db, {
        client_uuid: task.id,
        kind: "text",
        title: result.title,
        content: formatMeetingNotesContent(result, rawText),
        device_id: deviceId,
        date,
        source_meta: {
          source: "task",
          task_id: task.id,
          weight: "high",
          processed: true,
        },
      });
      const agent = insertMessage(this.db, {
        role: "agent",
        content: `会议纪要已整理并入库。节点 ${node.id.slice(0, 8)}…`,
        intent: null,
        task_id: task.id,
        meta: { phase: "done", node_id: node.id },
      });
      updateTask(this.db, task.id, {
        status: "done",
        result_message_id: agent.id,
        finished_at: nowIso(),
      });
    })();
  }

  private persistFailure(
    task: TaskRecord,
    rawText: string,
    deviceId: string | null,
    reason: string,
    date = todayDate(),
  ): void {
    try {
      this.db.transaction(() => {
        if (getTask(this.db, task.id)?.status !== "running") return;
        const node = rawText
          ? insertNode(this.db, {
              client_uuid: task.id,
              kind: "text",
              title: `会议纪要原文: ${rawText.slice(0, 40).replace(/\s+/g, " ")}`,
              content: rawText,
              device_id: deviceId,
              date,
              source_meta: {
                source: "task",
                task_id: task.id,
                weight: "high",
                processed: false,
                degraded: true,
              },
            }).node
          : null;
        const agent = insertMessage(this.db, {
          role: "agent",
          content: rawText
            ? "会议纪要自动整理失败；原文已保存，但未标记为已整理。"
            : "会议纪要任务数据无效，无法整理。",
          intent: null,
          task_id: task.id,
          meta: {
            phase: "failed",
            ...(node ? { node_id: node.id } : {}),
            reason,
          },
        });
        updateTask(this.db, task.id, {
          status: "failed",
          result_message_id: agent.id,
          finished_at: nowIso(),
        });
      })();
    } catch (err) {
      console.error(
        `[meeting-task] ${task.id} failure state could not be persisted:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

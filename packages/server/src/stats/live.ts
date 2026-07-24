import type { CharacterState, NodeRecord, Stats } from "@return/shared";
import { config } from "../config.js";
import {
  countCrossDayEdges,
  getDayByDate,
  listNodesByDate,
  todoCompletionRate,
} from "../db/repo.js";
import type { Db } from "../db/schema.js";
import { resolveCharacterState } from "./character.js";
import { computeStats, extractHealth } from "./compute.js";
import { allSessions } from "./sessions.js";

export interface LiveStats {
  date: string;
  stats: Stats;
  character_state: CharacterState;
  sessions: ReturnType<typeof allSessions>;
  nodes: NodeRecord[];
  saved: boolean;
  crossDayEdges: number;
}

export function computeLiveStats(db: Db, date: string): LiveStats {
  const day = getDayByDate(db, date);
  const nodes = listNodesByDate(db, date);
  const sessions = allSessions(nodes, config.sampleIntervalMin);
  const todos = day ? todoCompletionRate(db, day.id) : { total: 0, done: 0, rate: 0 };
  const crossDayEdges = day ? countCrossDayEdges(db, day.id) : 0;
  const health = extractHealth(nodes);

  // If already saved, prefer frozen stats.
  if (day?.saved_at && day.stats_json) {
    try {
      const stats = JSON.parse(day.stats_json) as Stats;
      return {
        date,
        stats,
        character_state:
          (day.character_state as CharacterState) ?? resolveCharacterState(stats),
        sessions,
        nodes,
        saved: true,
        crossDayEdges,
      };
    } catch {
      /* fall through to live */
    }
  }

  const stats = computeStats({
    nodes,
    sessions,
    todoRate: todos.rate,
    crossDayEdges,
    sleepMinutes: health.sleepMinutes,
    steps: health.steps,
  });

  return {
    date,
    stats,
    character_state: resolveCharacterState(stats),
    sessions,
    nodes,
    saved: Boolean(day?.saved_at),
    crossDayEdges,
  };
}

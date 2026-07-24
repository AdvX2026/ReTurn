import type { NodeRecord, Session } from "@return/shared";

/**
 * Prefer client sample time for offline-buffered nodes.
 * Only accept parseable ISO datetimes (Codex P2).
 */
export function nodeEventTime(n: NodeRecord): string {
  const meta = (n.source_meta ?? {}) as Record<string, unknown>;
  for (const c of [meta.sampled_at, meta.client_created_at]) {
    if (typeof c !== "string" || !c) continue;
    const t = Date.parse(c);
    if (!Number.isNaN(t)) return new Date(t).toISOString();
  }
  return n.created_at;
}

/**
 * Merge consecutive same-app samples into sessions.
 * Gap > sampleIntervalMin minutes severs the session (PRD §4.1).
 */
export function aggregateAppSessions(
  samples: NodeRecord[],
  sampleIntervalMin: number,
): Session[] {
  const appSamples = samples
    .filter((n) => n.kind === "app_sample")
    .slice()
    .sort(
      (a, b) =>
        new Date(nodeEventTime(a)).getTime() - new Date(nodeEventTime(b)).getTime(),
    );

  if (appSamples.length === 0) return [];

  const gapMs = sampleIntervalMin * 60_000 * 1.5; // 1.5× interval = disconnect
  const sessions: Session[] = [];

  let curApp = appName(appSamples[0]!);
  let curStart = nodeEventTime(appSamples[0]!);
  let curEnd = curStart;
  let lastTs = new Date(curStart).getTime();

  for (let i = 1; i < appSamples.length; i++) {
    const s = appSamples[i]!;
    const at = nodeEventTime(s);
    const ts = new Date(at).getTime();
    const app = appName(s);
    const severed = ts - lastTs > gapMs || app !== curApp;

    if (severed) {
      sessions.push(makeSession(curApp, "app", curStart, curEnd, sampleIntervalMin));
      curApp = app;
      curStart = at;
      curEnd = at;
    } else {
      curEnd = at;
    }
    lastTs = ts;
  }
  sessions.push(makeSession(curApp, "app", curStart, curEnd, sampleIntervalMin));
  return sessions;
}

/** Agent sessions carry their own start/end in source_meta or content. */
export function agentSessionsFromNodes(nodes: NodeRecord[]): Session[] {
  return nodes
    .filter((n) => n.kind === "agent_session")
    .map((n) => {
      const meta = (n.source_meta ?? {}) as Record<string, unknown>;
      const start =
        (meta.start as string | undefined) ??
        (meta.started_at as string | undefined) ??
        nodeEventTime(n);
      const end =
        (meta.end as string | undefined) ??
        (meta.ended_at as string | undefined) ??
        nodeEventTime(n);
      const durationMin =
        typeof meta.duration_min === "number"
          ? meta.duration_min
          : Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / 60_000);
      const app = (meta.project as string | undefined) ?? n.title ?? "agent";
      return {
        app,
        kind: "agent" as const,
        start,
        end,
        durationMin,
        meta,
      };
    });
}

export function allSessions(nodes: NodeRecord[], sampleIntervalMin: number): Session[] {
  return [
    ...aggregateAppSessions(nodes, sampleIntervalMin),
    ...agentSessionsFromNodes(nodes),
  ].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

function appName(n: NodeRecord): string {
  const meta = (n.source_meta ?? {}) as Record<string, unknown>;
  return (
    (meta.app as string | undefined) ??
    (meta.app_name as string | undefined) ??
    n.title ??
    "unknown"
  );
}

function makeSession(
  app: string,
  kind: "app" | "agent",
  start: string,
  end: string,
  sampleIntervalMin: number,
): Session {
  const rawMin = (new Date(end).getTime() - new Date(start).getTime()) / 60_000;
  // Single sample → count one sample interval of presence.
  const durationMin = Math.max(rawMin, sampleIntervalMin);
  return { app, kind, start, end, durationMin };
}

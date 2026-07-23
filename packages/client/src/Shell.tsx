import { useCallback, useEffect, useState } from "react";

/**
 * Minimal shell for spike / wiring verification only.
 * Product UI (Continue / Feed / Save / Timeline / …) is intentionally not here.
 *
 * Probes:
 *  - Pi: GET {serverUrl}/api/ping
 *  - Sampler localhost: GET http://127.0.0.1:8791/health
 *  - POST /sample-now
 */

const DEFAULT_PI = "http://127.0.0.1:8787";
const DEFAULT_SAMPLER = "http://127.0.0.1:8791";

interface Ping {
  ok: boolean;
  server_time?: string;
  version?: string;
}

interface SamplerHealth {
  ok: boolean;
  last_sample_at: string | null;
  outbox_size: number;
  pi_online: boolean;
  device_id: string | null;
  server_url: string;
  interval_min: number;
  error: string | null;
}

export function Shell() {
  const [serverUrl, setServerUrl] = useState(DEFAULT_PI);
  const [samplerUrl, setSamplerUrl] = useState(DEFAULT_SAMPLER);
  const [pi, setPi] = useState<Ping | null>(null);
  const [piErr, setPiErr] = useState<string | null>(null);
  const [sampler, setSampler] = useState<SamplerHealth | null>(null);
  const [samplerErr, setSamplerErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string>("");

  const refresh = useCallback(async () => {
    // Pi
    try {
      const res = await fetch(`${serverUrl.replace(/\/$/, "")}/api/ping`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPi((await res.json()) as Ping);
      setPiErr(null);
    } catch (err) {
      setPi(null);
      setPiErr(err instanceof Error ? err.message : String(err));
    }

    // Sampler
    try {
      const res = await fetch(`${samplerUrl.replace(/\/$/, "")}/health`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSampler((await res.json()) as SamplerHealth);
      setSamplerErr(null);
    } catch (err) {
      setSampler(null);
      setSamplerErr(err instanceof Error ? err.message : String(err));
    }
  }, [serverUrl, samplerUrl]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
  }, [refresh]);

  async function sampleNow(asSnapshot: boolean) {
    setBusy(true);
    setLog("");
    try {
      const res = await fetch(`${samplerUrl.replace(/\/$/, "")}/sample-now`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ as_snapshot: asSnapshot }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(body));
      setLog(JSON.stringify(body, null, 2));
      await refresh();
    } catch (err) {
      setLog(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell">
      <h1>ReTurn</h1>
      <p className="sub">
        Shell only — product UI later. Dual-process wiring check.
      </p>

      <div className="card">
        <h2>Pi server</h2>
        <input
          value={serverUrl}
          onChange={(e) => setServerUrl(e.target.value)}
          spellCheck={false}
        />
        <div className="row">
          <span>status</span>
          <span className={piErr ? "bad" : "ok"}>
            {piErr ? `offline (${piErr})` : pi ? `online v${pi.version}` : "…"}
          </span>
        </div>
        {pi?.server_time && (
          <div className="row">
            <span>server_time</span>
            <span>{pi.server_time}</span>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Sampler (localhost)</h2>
        <input
          value={samplerUrl}
          onChange={(e) => setSamplerUrl(e.target.value)}
          spellCheck={false}
        />
        <div className="row">
          <span>status</span>
          <span className={samplerErr ? "bad" : "ok"}>
            {samplerErr
              ? `unreachable (${samplerErr})`
              : sampler
                ? "running"
                : "…"}
          </span>
        </div>
        {sampler && (
          <>
            <div className="row">
              <span>last_sample_at</span>
              <span>{sampler.last_sample_at ?? "—"}</span>
            </div>
            <div className="row">
              <span>outbox_size</span>
              <span>{sampler.outbox_size}</span>
            </div>
            <div className="row">
              <span>pi_online (from sampler)</span>
              <span className={sampler.pi_online ? "ok" : "bad"}>
                {String(sampler.pi_online)}
              </span>
            </div>
            <div className="row">
              <span>device_id</span>
              <span>{sampler.device_id ?? "—"}</span>
            </div>
            <div className="row">
              <span>interval_min</span>
              <span>{sampler.interval_min}</span>
            </div>
            {sampler.error && (
              <div className="row">
                <span>error</span>
                <span className="bad">{sampler.error}</span>
              </div>
            )}
          </>
        )}
        <div className="actions">
          <button
            className="btn"
            disabled={busy}
            onClick={() => void sampleNow(false)}
          >
            sample-now
          </button>
          <button
            className="btn ghost"
            disabled={busy}
            onClick={() => void sampleNow(true)}
          >
            sample-now (snapshot)
          </button>
          <button className="btn ghost" onClick={() => void refresh()}>
            refresh
          </button>
        </div>
      </div>

      {log && (
        <div className="card">
          <h2>last response</h2>
          <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
            {log}
          </pre>
        </div>
      )}

      <p className="note">
        Run <code>pnpm dev:server</code> + <code>pnpm dev:sampler</code> +{" "}
        <code>pnpm --filter @return/client tauri:dev</code>. Sampler is a
        separate Node process; closing this window must not stop sampling.
      </p>
    </div>
  );
}

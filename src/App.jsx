import { useRef, useState } from "react";

function estimateTokens(value) {
  return Math.ceil(value.trim().length / 4);
}

export default function App() {
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState("");
  const [route, setRoute] = useState("");
  const [reason, setReason] = useState("");
  const [model, setModel] = useState("");
  const [latency, setLatency] = useState(null);
  const [estimatedInputTokens, setEstimatedInputTokens] = useState(0);
  const [costEstimate, setCostEstimate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const controllerRef = useRef(null);
  const requestIdRef = useRef(0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const nextPrompt = prompt.trim();
    if (!nextPrompt || loading) return;

    controllerRef.current?.abort();
    const controller = new AbortController();
    const requestId = ++requestIdRef.current;
    const startedAt = performance.now();
    controllerRef.current = controller;
    setLoading(true);
    setError("");
    setOutput("");
    setRoute("");
    setReason("");
    setModel("");
    setLatency(null);
    setEstimatedInputTokens(estimateTokens(nextPrompt));
    setCostEstimate(null);

    try {
      const res = await fetch("http://localhost:3001/api/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: nextPrompt }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const failure = new Error(data.error || "Something went wrong.");
        failure.code = data.code;
        throw failure;
      }
      if (requestId !== requestIdRef.current) return;
      setOutput(data.output || "No output returned.");
      setRoute(data.route || "unknown");
      setReason(data.reason || "");
      setModel(data.model || data.route || "unknown");
      setLatency(data.durationMs ?? Math.round(performance.now() - startedAt));
      setEstimatedInputTokens(data.estimatedInputTokens ?? estimateTokens(nextPrompt));
      setCostEstimate(data.costEstimate ?? null);
      setHistory((prev) => [
        { prompt: nextPrompt, route: data.route, reason: data.reason, output: data.output, model: data.model, durationMs: data.durationMs },
        ...prev.slice(0, 4),
      ]);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      if (err.name === "AbortError") {
        setError("Request cancelled.");
        setRoute("cancelled");
        setReason("The request was stopped before completion.");
      } else {
        setError(err.message || "The request failed.");
        setRoute("error");
        setReason(err.code === "RATE_LIMITED" ? "The router rate limit was reached." : "The request failed before a result was available.");
      }
    } finally {
      if (requestId === requestIdRef.current) {
        controllerRef.current = null;
        setLoading(false);
      }
    }
  };

  const cancelRequest = () => controllerRef.current?.abort();

  const copyOutput = async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setError("Output copied.");
    } catch {
      setError("Copy is unavailable in this browser. Select the output manually.");
    }
  };

  return (
    <div className="app">
      <div className="card">
        <h1>Token-Smart Router</h1>
        <p className="subtitle">Route simple formatting tasks locally and complex prompts to the configured model provider.</p>

        <form onSubmit={handleSubmit}>
          <label htmlFor="prompt">Prompt</label>
          <textarea id="prompt" rows="6" maxLength="2000" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Try: Create a 2-week plan for building a student cricket analytics app" />
          <div className="prompt-footer">
            <span>{prompt.length}/2000 characters · approximately {estimateTokens(prompt)} input tokens</span>
            <button type="submit" disabled={loading || !prompt.trim()}>{loading ? "Thinking…" : "Run Prompt"}</button>
            {loading && <button type="button" className="secondary-button" onClick={cancelRequest}>Cancel</button>}
          </div>
        </form>

        <div className="result" aria-live="polite">
          <div className="meta-grid">
            <span><strong>Route:</strong> {route || "-"}</span>
            <span><strong>Model:</strong> {model || "-"}</span>
            <span><strong>Latency:</strong> {latency == null ? "-" : `${latency} ms`}</span>
            <span><strong>Input estimate:</strong> {estimatedInputTokens || "-"} tokens</span>
            <span><strong>Cost:</strong> {costEstimate ?? "Not configured"}</span>
          </div>
          <p className="meta"><strong>Reason:</strong> {reason || "-"}</p>
          {error && <p className="error" role="alert">{error}</p>}
          <pre>{output || "Output will appear here."}</pre>
          {output && <button type="button" className="secondary-button" onClick={copyOutput}>Copy output</button>}
        </div>
      </div>

      <div className="card">
        <div className="section-heading">
          <h2>Recent runs</h2>
          {history.length > 0 && <button type="button" className="secondary-button" onClick={() => setHistory([])}>Clear history</button>}
        </div>
        {history.length === 0 ? <p className="empty">No runs yet. History is kept in memory for this tab only.</p> : history.map((item, index) => (
          <div className="historyItem" key={`${item.prompt}-${index}`}>
            <p><strong>Prompt:</strong> {item.prompt}</p>
            <p><strong>Route:</strong> {item.route} · <strong>Model:</strong> {item.model || "-"} · <strong>Latency:</strong> {item.durationMs ?? "-"} ms</p>
            <p><strong>Reason:</strong> {item.reason}</p>
            <div className="history-actions">
              <button type="button" className="secondary-button" onClick={() => setPrompt(item.prompt)}>Use prompt again</button>
              <button type="button" className="secondary-button" onClick={() => navigator.clipboard?.writeText(item.output || "")}>Copy result</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

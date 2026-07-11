import { useState } from "react";

export default function App() {
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState("");
  const [route, setRoute] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setOutput("");
    setRoute("");
    setReason("");

    try {
      const res = await fetch("http://localhost:3001/api/route", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      setOutput(data.output);
      setRoute(data.route);
      setReason(data.reason);

      setHistory((prev) => [
        {
          prompt,
          route: data.route,
          reason: data.reason,
          output: data.output,
        },
        ...prev.slice(0, 4),
      ]);
    } catch (err) {
      setOutput(err.message);
      setRoute("error");
      setReason("The request failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <div className="card">
        <h1>Token-Smart Router</h1>
        <p className="subtitle">
          Simple Track 1 demo: route easy prompts locally and complex ones to
          Fireworks.
        </p>

        <form onSubmit={handleSubmit}>
          <textarea
            rows="6"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Try: Create a 2-week plan for building a student cricket analytics app"
          />
          <button type="submit" disabled={loading}>
            {loading ? "Thinking..." : "Run Prompt"}
          </button>
        </form>

        <div className="result">
          <div className="meta">
            <span>
              <strong>Route:</strong> {route || "-"}
            </span>
          </div>
          <div className="meta">
            <span>
              <strong>Reason:</strong> {reason || "-"}
            </span>
          </div>
          <pre>{output || "Output will appear here."}</pre>
        </div>
      </div>

      <div className="card">
        <h2>Recent runs</h2>
        {history.length === 0 ? (
          <p className="empty">No runs yet.</p>
        ) : (
          history.map((item, index) => (
            <div className="historyItem" key={index}>
              <p><strong>Prompt:</strong> {item.prompt}</p>
              <p><strong>Route:</strong> {item.route}</p>
              <p><strong>Reason:</strong> {item.reason}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
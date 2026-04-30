import { useState } from "react";

const SERVER = import.meta.env.VITE_SERVER_URL ?? "http://localhost:8001";

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("username", username);
      form.append("password", password);

      const res = await fetch(`${SERVER}/login`, {
        method: "POST", body: form
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail ?? "Login failed");
      }

      const { access_token } = await res.json();
      localStorage.setItem("sv_token", access_token);
      onLogin(access_token, username);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", background: "#0a0a0f",
      fontFamily: "system-ui, sans-serif"
    }}>
      <div style={{
        background: "#13131a", border: "1px solid #2a2a3a",
        borderRadius: 16, padding: "36px 32px", width: 340
      }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🎧</div>
          <h1 style={{ color: "#fff", fontSize: 20, fontWeight: 600,
                       margin: "0 0 4px" }}>SpatialVoice</h1>
          <p style={{ color: "#666", fontSize: 13, margin: 0 }}>
            Samsung ennovateX · PS08
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ color: "#aaa", fontSize: 12,
                            display: "block", marginBottom: 6 }}>
              Username
            </label>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="demo"
              autoComplete="username"
              style={{
                width: "100%", padding: "10px 12px",
                background: "#1e1e2e", border: "1px solid #2a2a3a",
                borderRadius: 8, color: "#fff", fontSize: 14,
                boxSizing: "border-box", outline: "none"
              }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ color: "#aaa", fontSize: 12,
                            display: "block", marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              style={{
                width: "100%", padding: "10px 12px",
                background: "#1e1e2e", border: "1px solid #2a2a3a",
                borderRadius: 8, color: "#fff", fontSize: 14,
                boxSizing: "border-box", outline: "none"
              }}
            />
          </div>

          {error && (
            <div style={{
              background: "#2a0a0a", border: "1px solid #5a1a1a",
              borderRadius: 8, padding: "8px 12px",
              color: "#ff6b6b", fontSize: 13, marginBottom: 14
            }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            width: "100%", padding: "11px",
            background: loading ? "#333" : "#534AB7",
            color: "#fff", border: "none", borderRadius: 8,
            fontSize: 15, fontWeight: 500, cursor: "pointer"
          }}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p style={{ color: "#444", fontSize: 11, textAlign: "center",
                    marginTop: 20, marginBottom: 0 }}>
          Demo credentials: demo / spatial2026
        </p>
      </div>
    </div>
  );
}

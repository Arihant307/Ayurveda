"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en-IN">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#FCF9F0", color: "#1F2A24", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ color: "#0D4E34" }}>Something went wrong</h1>
          <p>Please try again, or call us on +91 96101 01144.</p>
          <button onClick={reset} style={{ marginTop: 16, padding: "12px 24px", borderRadius: 999, border: 0, background: "#0D4E34", color: "#fff", fontWeight: 700 }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}

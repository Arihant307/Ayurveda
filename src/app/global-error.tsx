"use client";

// Rendered when the root layout itself fails, so globals.css may not be loaded:
// colours mirror the brand tokens (navy #061685, ink #1A1F3D).

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en-IN">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#FFFFFF", color: "#1A1F3D", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ color: "#061685" }}>Something went wrong</h1>
          <p>Please try again, or call us on +91 96101 01144.</p>
          <button onClick={reset} style={{ marginTop: 16, padding: "12px 24px", borderRadius: 999, border: 0, background: "#061685", color: "#fff", fontWeight: 700 }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}

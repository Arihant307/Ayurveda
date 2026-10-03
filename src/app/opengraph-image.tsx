import { ImageResponse } from "next/og";

export const alt = "Kumar Ayurveda — Ayurveda & Panchakarma Clinic in Jaipur";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Image generation can't read CSS variables; colours mirror the brand tokens in globals.css.
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#FFFFFF",
          borderLeft: "28px solid #061685",
        }}
      >
        <div style={{ fontSize: 30, letterSpacing: 8, color: "#077A71", fontWeight: 700 }}>AYURVEDA & PANCHAKARMA · JAIPUR</div>
        <div style={{ fontSize: 96, color: "#061685", fontWeight: 700, marginTop: 24, letterSpacing: 4 }}>KUMAR AYURVEDA</div>
        <div style={{ fontSize: 40, color: "#1A1F3D", marginTop: 24 }}>Holistic wellness, rooted in classical Ayurveda</div>
        <div style={{ width: 120, height: 8, borderRadius: 4, marginTop: 36, backgroundImage: "linear-gradient(90deg, #E01993, #5B1BCA)" }} />
        <div style={{ fontSize: 30, color: "#50567A", marginTop: 28 }}>Vaishali Nagar, Jaipur · +91 96101 01144</div>
      </div>
    ),
    size,
  );
}

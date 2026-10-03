import { ImageResponse } from "next/og";

export const alt = "Kumar Ayurveda — Ayurveda & Panchakarma Clinic in Jaipur";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

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
          background: "#FCF9F0",
          borderLeft: "28px solid #0D4E34",
        }}
      >
        <div style={{ fontSize: 30, letterSpacing: 8, color: "#08766D", fontWeight: 700 }}>AYURVEDA & PANCHAKARMA · JAIPUR</div>
        <div style={{ fontSize: 96, color: "#061685", fontWeight: 700, marginTop: 24, letterSpacing: 4 }}>KUMAR AYURVEDA</div>
        <div style={{ fontSize: 40, color: "#0D4E34", marginTop: 24 }}>Holistic wellness, rooted in classical Ayurveda</div>
        <div style={{ fontSize: 30, color: "#5B6660", marginTop: 40 }}>Vaishali Nagar, Jaipur · +91 96101 01144</div>
      </div>
    ),
    size,
  );
}

import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(140px 140px at 35% 35%, #ffffff 0%, #fff0f7 40%, #ffd1e6 70%, #ff4fa0 110%)",
          borderRadius: 40,
        }}
      >
        <div
          style={{
            width: 110,
            height: 110,
            borderRadius: 999,
            background:
              "linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.55) 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 18px 40px rgba(0,0,0,0.12)",
            border: "1px solid rgba(36,26,34,0.08)",
            position: "relative",
          }}
        >
          <div
            style={{
              width: 62,
              height: 14,
              borderRadius: 999,
              background:
                "linear-gradient(135deg, #ff4fa0 0%, #9b5cff 100%)",
              transform: "rotate(45deg)",
              position: "absolute",
            }}
          />
          <div
            style={{
              width: 62,
              height: 14,
              borderRadius: 999,
              background:
                "linear-gradient(135deg, #ff4fa0 0%, #9b5cff 100%)",
              transform: "rotate(-45deg)",
              position: "absolute",
            }}
          />
        </div>
      </div>
    ),
    size,
  );
}

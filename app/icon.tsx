import { ImageResponse } from "next/og";

export const size = { width: 256, height: 256 };
export const contentType = "image/png";

export default function Icon() {
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
            "radial-gradient(160px 160px at 35% 35%, #ffffff 0%, #fff0f7 40%, #ffd1e6 70%, #ff4fa0 110%)",
          borderRadius: 64,
        }}
      >
        <div
          style={{
            width: 150,
            height: 150,
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
              width: 84,
              height: 16,
              borderRadius: 999,
              background:
                "linear-gradient(135deg, #ff4fa0 0%, #9b5cff 100%)",
              transform: "rotate(45deg)",
              position: "absolute",
            }}
          />
          <div
            style={{
              width: 84,
              height: 16,
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

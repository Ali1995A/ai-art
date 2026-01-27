import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pink Doodle AI",
    short_name: "Doodle AI",
    description: "Draw and make pictures with AI.",
    start_url: "/",
    display: "standalone",
    background_color: "#fff6fb",
    theme_color: "#ffd1e6",
    icons: [
      {
        src: "/icon",
        sizes: "256x256",
        type: "image/png",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}


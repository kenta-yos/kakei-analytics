import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "家計の締め",
    short_name: "家計",
    description: "月末の予算配分と、資産・損益の振り返り",
    start_url: "/",
    display: "standalone",
    background_color: "#F4F3EF",
    theme_color: "#F4F3EF",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}

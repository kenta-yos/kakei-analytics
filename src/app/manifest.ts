import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "くらしの決算",
    short_name: "くらしの決算",
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

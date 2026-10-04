import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// base "./" sorgt dafür, dass die App sowohl auf Cloudflare Pages (Domain-Wurzel)
// als auch auf GitHub Pages (Unterordner /repo-name/) funktioniert.
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/apple-touch-icon.png", "icons/icon.svg"],
      manifest: {
        name: "Satz & Strecke",
        short_name: "Satz & Strecke",
        description: "Krafttraining mit Progression und Läufe festhalten",
        lang: "de",
        start_url: "./",
        scope: "./",
        display: "standalone",
        orientation: "portrait",
        background_color: "#12171E",
        theme_color: "#12171E",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: { globPatterns: ["**/*.{js,css,html,png,svg,woff2}"] },
    }),
  ],
});

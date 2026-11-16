import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// publicDir points at ../public so one copy of style.css, logo.svg, doctors.xml and hospital.html
// is shared by the dev server and the production build.
export default defineConfig({
  plugins: [react()],
  publicDir: "../public",
  server: { proxy: { "/api": "http://127.0.0.1:3001" } }, // `npm run dev` talks to the Express API
  build: { outDir: "dist", emptyOutDir: true },
});

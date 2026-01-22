import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";

const config = defineConfig({
  plugins: [tanstackStart()],
});

export default config;

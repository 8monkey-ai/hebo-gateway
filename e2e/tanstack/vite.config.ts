import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

const config = defineConfig({
  plugins: [nitro(), tanstackStart()],
});

export default config;

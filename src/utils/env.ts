const NODE_ENV =
  typeof process === "undefined"
    ? ((globalThis as any).NODE_ENV ?? (globalThis as any).ENV?.NODE_ENV)
    : process.env?.NODE_ENV;

export const isProduction = () => NODE_ENV === "production";

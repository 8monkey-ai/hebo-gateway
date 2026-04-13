// oxlint-disable-next-line no-unsafe-assignment
const NODE_ENV =
  typeof process === "undefined"
    ? // oxlint-disable-next-line no-unsafe-member-access
      ((globalThis as any).NODE_ENV ?? (globalThis as any).ENV?.NODE_ENV)
    : process.env?.["NODE_ENV"];

export const isProduction = () => NODE_ENV === "production";
export const isTest = () => NODE_ENV === "test";

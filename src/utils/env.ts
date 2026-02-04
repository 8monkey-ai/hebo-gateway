export const isProduction = () =>
  typeof process !== "undefined" && process.env?.NODE_ENV === "production";

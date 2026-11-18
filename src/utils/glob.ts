/** Compiles a `*` wildcard pattern into an anchored matcher. */
export function compileGlob(pattern: string): (key: string) => boolean {
  if (!pattern.includes("*")) return (key) => key === pattern;

  // Escape only characters that are `SyntaxCharacter`s: in unicode mode `\-` is an
  // invalid identity escape, and `-` is not special outside a character class anyway.
  const re = new RegExp(
    `^${pattern
      .split("*")
      .map((p) => p.replaceAll(/[\\^$+?.()|[\]{}]/gu, "\\$&"))
      .join(".*")}$`,
    "u",
  );

  return (key) => re.test(key);
}

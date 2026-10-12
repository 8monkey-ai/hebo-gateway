import { describe, expect, test } from "bun:test";

import { hasUrlScheme, isDataUrl, parseDataUrl } from "./url";

describe("isDataUrl", () => {
  test.each(["data:application/pdf;base64,aGk=", "DATA:application/pdf;base64,aGk=", "Data:,x"])(
    "accepts %s",
    (value) => {
      expect(isDataUrl(value)).toBe(true);
    },
  );

  test.each(["", "data", "http://example.com/a.pdf", "aGVsbG8=", " data:,x"])(
    "rejects %s",
    (value) => {
      expect(isDataUrl(value)).toBe(false);
    },
  );
});

describe("hasUrlScheme", () => {
  test.each(["http://example.com", "HTTPS://example.com", "file:///tmp/a", "mailto:a@b.c"])(
    "detects a scheme in %s",
    (value) => {
      expect(hasUrlScheme(value)).toBe(true);
    },
  );

  test("rejects a bare base64 payload without scanning it", () => {
    expect(hasUrlScheme("a".repeat(1_000_000))).toBe(false);
  });

  test.each([":no-scheme", "example.com/a.pdf", "aGVsbG8="])("rejects %s", (value) => {
    expect(hasUrlScheme(value)).toBe(false);
  });

  test("ignores separators beyond the longest plausible scheme", () => {
    expect(hasUrlScheme(`${"a".repeat(17)}:b`)).toBe(false);
  });
});

describe("parseDataUrl", () => {
  test("parses the media type and payload offset", () => {
    expect(parseDataUrl("data:text/plain;base64,aGk=")).toEqual({
      mimeType: "text/plain",
      dataStart: 23,
    });
  });

  test("parses an uppercase scheme", () => {
    expect(parseDataUrl("DATA:text/plain;base64,aGk=").mimeType).toBe("text/plain");
  });

  test("returns an empty media type for non-data URLs", () => {
    expect(parseDataUrl("https://example.com/a.pdf")).toEqual({ mimeType: "", dataStart: 0 });
  });
});

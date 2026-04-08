import { describe, expect, test } from "bun:test";
import {
  dateToNumber,
  dateToBigInt,
  jsonStringify,
  escapeSqlString,
  createParamsMapper,
  createRowMapper,
  parseJson,
  toMilliseconds,
  mergeData,
} from "./utils";

describe("SQL Dialect Utilities", () => {
  describe("Atomic Parameter Mappers", () => {
    test("dateToNumber", () => {
      const now = new Date();
      expect(dateToNumber(now)).toBe(now.getTime());
      expect(dateToNumber(123)).toBe(123);
    });

    test("dateToBigInt", () => {
      const now = new Date();
      expect(dateToBigInt(now)).toBe(BigInt(now.getTime()));
    });

    test("jsonStringify", () => {
      const obj = { foo: "bar" };
      expect(jsonStringify(obj)).toBe(JSON.stringify(obj));
      expect(jsonStringify(null)).toBe(null);
      expect(jsonStringify(123)).toBe(123);

      // Binary mode (for pg/greptime)
      const binary = jsonStringify(obj, true) as Uint8Array;
      expect(binary instanceof Uint8Array).toBe(true);
      expect(new TextDecoder().decode(binary)).toBe(JSON.stringify(obj));
    });

    test("escapeSqlString", () => {
      expect(escapeSqlString("It's a trap")).toBe("It''s a trap");
    });
  });

  describe("createParamsMapper", () => {
    test("should pipe multiple mappers to params", () => {
      const mapper = createParamsMapper([dateToNumber, (v) => (typeof v === "number" ? v * 2 : v)]);
      const now = new Date(1000);
      const results = mapper([now, 50]);
      expect(results).toEqual([2000, 100]);
    });
  });

  describe("Row Mappers", () => {
    test("parseJson with GreptimeDB Unicode workaround", () => {
      const mapper = parseJson("data");

      // Standard JSON
      const row1 = { data: '{"foo":"bar"}' };
      expect(mapper(row1)["data"]).toEqual({ foo: "bar" });

      // GreptimeDB specific Rust-style escapes: \u{...}
      // These are invalid in standard JSON.parse()
      const row2 = { data: '{"msg":"hello \\u{1f600}"}' };
      const result = mapper(row2);
      expect(result["data"]).toEqual({ msg: "hello 😀" });
    });

    test("toMilliseconds", () => {
      const mapper = toMilliseconds("ts");
      const now = new Date();
      expect(mapper({ ts: now })["ts"]).toBe(now.getTime());
      expect(mapper({ ts: "1000" })["ts"]).toBe(1000);
    });

    test("mergeData", () => {
      const mapper = mergeData("data");
      const row = { id: 1, data: { name: "test", val: 100 } };
      const result = mapper(row);

      expect(result["id"]).toBe(1);
      expect(result["name"]).toBe("test");
      expect(result["val"]).toBe(100);
      expect(result["data"]).toEqual({ name: "test", val: 100 });
    });

    test("createRowMapper piping", () => {
      const mapper = createRowMapper<Record<string, unknown>>([
        parseJson("data"),
        mergeData("data"),
        toMilliseconds("created_at"),
      ]);

      const row = {
        created_at: "1000",
        data: '{"foo":"bar"}',
      };

      const result = mapper(row);
      expect(result["created_at"]).toBe(1000);
      expect(result["foo"]).toBe("bar");
      expect(result["data"]).toEqual({ foo: "bar" });
    });
  });
});

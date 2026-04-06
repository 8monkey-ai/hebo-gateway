import { describe, expect, test } from "bun:test";

import { parseRequestBody, DEFAULT_MAX_BODY_SIZE } from "./body";

function jsonRequest(body: unknown, headers?: Record<string, string>): Request {
  return new Request("http://localhost/test", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function gzipRequest(data: ArrayBuffer, headers?: Record<string, string>): Request {
  return new Request("http://localhost/test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Encoding": "gzip",
      ...headers,
    },
    body: data,
  });
}

function deflateRequest(data: ArrayBuffer): Request {
  return new Request("http://localhost/test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Encoding": "deflate",
    },
    body: data,
  });
}

function compress(json: unknown, format: CompressionFormat): Promise<ArrayBuffer> {
  const raw = new TextEncoder().encode(JSON.stringify(json));
  const cs = new CompressionStream(format);
  const writer = cs.writable.getWriter();
  void writer.write(raw);
  void writer.close();
  return new Response(cs.readable).arrayBuffer();
}

describe("parseRequestBody", () => {
  // ── Plain JSON (no encoding) ────────────────────────────

  test("parses plain JSON body", async () => {
    const payload = { model: "gpt-4", messages: [{ role: "user", content: "hi" }] };
    const result = await parseRequestBody(jsonRequest(payload));
    expect(result).toEqual(payload);
  });

  test("returns 400 for invalid JSON", async () => {
    const request = new Request("http://localhost/test", {
      method: "POST",
      body: "not json",
    });
    try {
      await parseRequestBody(request);
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      expect(err).toMatchObject({ message: "Invalid JSON", status: 400 });
    }
  });

  test("handles identity encoding as plain", async () => {
    const payload = { hello: "world" };
    const result = await parseRequestBody(
      jsonRequest(payload, { "Content-Encoding": "identity" }),
    );
    expect(result).toEqual(payload);
  });

  // ── Gzip ────────────────────────────────────────────────

  test("decompresses gzip body", async () => {
    const payload = { model: "gpt-4", messages: [{ role: "user", content: "hello" }] };
    const compressed = await compress(payload, "gzip");
    const result = await parseRequestBody(gzipRequest(compressed));
    expect(result).toEqual(payload);
  });

  test("returns 400 for invalid gzip data", async () => {
    const request = gzipRequest(new Uint8Array([0x00, 0x01, 0x02, 0x03]).buffer);
    try {
      await parseRequestBody(request);
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      expect(err).toMatchObject({ message: "Invalid compressed body", status: 400 });
    }
  });

  test("returns 400 for gzip header with plain JSON body", async () => {
    const plainJson = new TextEncoder().encode('{"hello":"world"}');
    const request = gzipRequest(plainJson.buffer);
    try {
      await parseRequestBody(request);
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      expect(err).toMatchObject({ message: "Invalid compressed body", status: 400 });
    }
  });

  // ── Deflate ─────────────────────────────────────────────

  test("decompresses deflate body", async () => {
    const payload = { format: "deflate", data: [1, 2, 3] };
    const compressed = await compress(payload, "deflate");
    const result = await parseRequestBody(deflateRequest(compressed));
    expect(result).toEqual(payload);
  });

  // ── Unsupported encodings ───────────────────────────────

  test("returns 415 for unsupported encoding (br)", async () => {
    const request = new Request("http://localhost/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Encoding": "br",
      },
      body: "data",
    });
    try {
      await parseRequestBody(request);
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      expect(err).toMatchObject({ message: "Unsupported Content-Encoding: br", status: 415 });
    }
  });

  test("returns 415 for unsupported encoding (zstd)", async () => {
    const request = new Request("http://localhost/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Encoding": "zstd",
      },
      body: "data",
    });
    try {
      await parseRequestBody(request);
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      expect(err).toMatchObject({ message: "Unsupported Content-Encoding: zstd", status: 415 });
    }
  });

  // ── Body size limits ────────────────────────────────────

  test("rejects plain body exceeding size limit", async () => {
    const large = { data: "x".repeat(200) };
    try {
      await parseRequestBody(jsonRequest(large), 100);
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      expect(err).toMatchObject({ status: 413 });
    }
  });

  test("rejects plain body when Content-Length exceeds limit", async () => {
    const body = JSON.stringify({ data: "x".repeat(200) });
    const request = new Request("http://localhost/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(body.length),
      },
      body,
    });
    try {
      await parseRequestBody(request, 100);
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      expect(err).toMatchObject({ status: 413 });
    }
  });

  test("allows body within size limit", async () => {
    const payload = { ok: true };
    const result = await parseRequestBody(jsonRequest(payload), 10000);
    expect(result).toEqual(payload);
  });

  test("disables size limit when maxBodySize is 0", async () => {
    const payload = { data: "x".repeat(5000) };
    const result = await parseRequestBody(jsonRequest(payload), 0);
    expect(result).toEqual(payload);
  });

  test("rejects decompressed body exceeding size limit", async () => {
    const large = { data: "x".repeat(5000) };
    const compressed = await compress(large, "gzip");
    try {
      await parseRequestBody(gzipRequest(compressed), 100);
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      expect(err).toMatchObject({ status: 413 });
    }
  });

  test("default max body size is 1 MB", () => {
    expect(DEFAULT_MAX_BODY_SIZE).toBe(1024 * 1024);
  });

  // ── Edge cases ──────────────────────────────────────────

  test("handles empty body with gzip encoding", async () => {
    const request = new Request("http://localhost/test", {
      method: "POST",
      headers: { "Content-Encoding": "gzip" },
      body: new ArrayBuffer(0),
    });
    try {
      await parseRequestBody(request);
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      expect(err).toMatchObject({ status: 400 });
    }
  });
});

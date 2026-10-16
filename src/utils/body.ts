import { GatewayError } from "../errors/gateway";

/**
 * Supported Content-Encoding values for request body decompression.
 * Uses the Web Compression Streams API (`DecompressionStream`) for runtime portability.
 */
const SUPPORTED_ENCODINGS = new Set(["gzip", "deflate"]);

/**
 * Default maximum decompressed body size (10 MB).
 */
export const DEFAULT_MAX_BODY_SIZE = 10 * 1024 * 1024;

/** Parses a body stream as JSON (for use with `readRequestBody`). */
export const readJson = (body: ReadableStream<Uint8Array>): Promise<unknown> =>
  new Response(body).json();

/**
 * Parse a request body as JSON, handling Content-Encoding decompression
 * and enforcing a decompressed body size limit for compressed requests.
 *
 * For plain (uncompressed) requests, body size enforcement is expected to be
 * handled by the parent framework (e.g. Hono's `bodyLimit` middleware, or
 * Bun/Node server-level `maxRequestBodySize`). This utility only enforces
 * `maxBodySize` on the *decompressed* output of gzip/deflate streams, since
 * the framework cannot know the decompressed size ahead of time.
 *
 * @param request - Incoming Web API Request
 * @param maxBodySize - Maximum decompressed body size in bytes. `0` disables the limit. Defaults to 10 MB.
 * @returns Parsed JSON body
 */
export function parseRequestBody(
  request: Request,
  maxBodySize: number = DEFAULT_MAX_BODY_SIZE,
): Promise<unknown> {
  const encoding = request.headers.get("content-encoding");

  // No encoding — delegate to framework for size enforcement, just parse JSON.
  if (!encoding || encoding === "identity") {
    return parsePlainBody(request);
  }

  // Reject unsupported encodings early.
  if (!SUPPORTED_ENCODINGS.has(encoding)) {
    throw new GatewayError(`Unsupported Content-Encoding: ${encoding}`, 415);
  }

  return readCompressedBody(
    request,
    encoding as CompressionFormat,
    maxBodySize,
    readJson,
    "Invalid JSON",
  );
}

async function parsePlainBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new GatewayError("Invalid JSON", 400);
  }
}

/**
 * Read a request body through `read`, handling Content-Encoding decompression and
 * enforcing `maxBodySize` on both plain and decompressed bodies.
 *
 * Unlike `parseRequestBody`, the limit also applies to plain bodies: endpoints that
 * accept binary uploads (e.g. audio) use this so oversized payloads are rejected
 * even when the framework does not enforce a request size limit.
 *
 * The limit is enforced on the stream itself, so the body is never buffered
 * separately from what `read` (e.g. `Response.json()` / `.formData()`) holds.
 *
 * @param request - Incoming Web API Request
 * @param maxBodySize - Maximum body size in bytes. `0` disables the limit.
 * @param read - Consumes the (decompressed) body stream, e.g. `readJson`
 * @param invalidMessage - 400 message when `read` fails on a fully received body
 */
export function readRequestBody<T>(
  request: Request,
  maxBodySize: number,
  read: (body: ReadableStream<Uint8Array>) => Promise<T>,
  invalidMessage: string,
): Promise<T> {
  const encoding = request.headers.get("content-encoding");

  if (!encoding || encoding === "identity") {
    // Cheap early rejection when the client declares an oversized body.
    const contentLength = Number(request.headers.get("content-length"));
    if (maxBodySize > 0 && contentLength > maxBodySize) {
      throw new GatewayError(`Request body too large (exceeds ${maxBodySize} byte limit)`, 413);
    }
    if (!request.body) {
      throw new GatewayError("Empty request body", 400);
    }
    return readLimited(request.body, maxBodySize, read, {
      tooLarge: `Request body too large (exceeds ${maxBodySize} byte limit)`,
      invalidStream: "Invalid request body",
      invalidContent: invalidMessage,
    });
  }

  if (!SUPPORTED_ENCODINGS.has(encoding)) {
    throw new GatewayError(`Unsupported Content-Encoding: ${encoding}`, 415);
  }

  return readCompressedBody(
    request,
    encoding as CompressionFormat,
    maxBodySize,
    read,
    invalidMessage,
  );
}

function readCompressedBody<T>(
  request: Request,
  encoding: CompressionFormat,
  maxBodySize: number,
  read: (body: ReadableStream<Uint8Array>) => Promise<T>,
  invalidMessage: string,
): Promise<T> {
  if (!request.body) {
    throw new GatewayError("Empty request body", 400);
  }

  let decompressedStream: ReadableStream<Uint8Array>;
  try {
    decompressedStream = request.body.pipeThrough(new DecompressionStream(encoding));
  } catch {
    throw new GatewayError("Invalid compressed body", 400);
  }

  return readLimited(decompressedStream, maxBodySize, read, {
    tooLarge: `Decompressed body too large (exceeds ${maxBodySize} byte limit)`,
    invalidStream: "Invalid compressed body",
    invalidContent: invalidMessage,
  });
}

async function readLimited<T>(
  stream: ReadableStream<Uint8Array>,
  maxBodySize: number,
  read: (body: ReadableStream<Uint8Array>) => Promise<T>,
  messages: { tooLarge: string; invalidStream: string; invalidContent: string },
): Promise<T> {
  // Failures are classified with flags rather than error identity: runtimes may wrap
  // stream errors surfaced through `Response.json()` / `.formData()`.
  let size = 0;
  let tooLarge = false;
  let complete = false;

  const limited = stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        size += chunk.byteLength;
        if (maxBodySize > 0 && size > maxBodySize) {
          tooLarge = true;
          controller.error(new Error(messages.tooLarge));
        } else {
          controller.enqueue(chunk);
        }
      },
      flush() {
        complete = true;
      },
    }),
  );

  try {
    return await read(limited);
  } catch {
    if (tooLarge) throw new GatewayError(messages.tooLarge, 413);
    if (!complete) throw new GatewayError(messages.invalidStream, 400);
    if (size === 0) throw new GatewayError("Empty request body", 400);
    throw new GatewayError(messages.invalidContent, 400);
  }
}

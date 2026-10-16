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

const TEXT_DECODER = new TextDecoder();

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

  return parseCompressedBody(request, encoding as CompressionFormat, maxBodySize);
}

async function parsePlainBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new GatewayError("Invalid JSON", 400);
  }
}

async function parseCompressedBody(
  request: Request,
  encoding: CompressionFormat,
  maxBodySize: number,
): Promise<unknown> {
  const bytes = await readCompressedBody(request, encoding, maxBodySize);
  try {
    return JSON.parse(TEXT_DECODER.decode(bytes));
  } catch {
    throw new GatewayError("Invalid JSON", 400);
  }
}

/**
 * Read a request body as bytes, handling Content-Encoding decompression and
 * enforcing `maxBodySize` on both plain and decompressed bodies.
 *
 * Unlike `parseRequestBody`, the limit also applies to plain bodies: endpoints that
 * accept binary uploads (e.g. audio) use this so oversized payloads are rejected
 * even when the framework does not enforce a request size limit.
 *
 * @param request - Incoming Web API Request
 * @param maxBodySize - Maximum body size in bytes. `0` disables the limit. Defaults to 10 MB.
 * @returns Raw (decompressed) body bytes
 */
export function readRequestBody(
  request: Request,
  maxBodySize: number = DEFAULT_MAX_BODY_SIZE,
): Promise<Uint8Array> {
  const encoding = request.headers.get("content-encoding");

  if (!encoding || encoding === "identity") {
    return readPlainBody(request, maxBodySize);
  }

  if (!SUPPORTED_ENCODINGS.has(encoding)) {
    throw new GatewayError(`Unsupported Content-Encoding: ${encoding}`, 415);
  }

  return readCompressedBody(request, encoding as CompressionFormat, maxBodySize);
}

function readPlainBody(request: Request, maxBodySize: number): Promise<Uint8Array> {
  // Cheap early rejection when the client declares an oversized body.
  const contentLength = Number(request.headers.get("content-length"));
  if (maxBodySize > 0 && contentLength > maxBodySize) {
    throw new GatewayError(`Request body too large (exceeds ${maxBodySize} byte limit)`, 413);
  }

  if (!request.body) {
    throw new GatewayError("Empty request body", 400);
  }

  return readLimited(
    request.body,
    maxBodySize,
    `Request body too large (exceeds ${maxBodySize} byte limit)`,
    "Invalid request body",
  );
}

function readCompressedBody(
  request: Request,
  encoding: CompressionFormat,
  maxBodySize: number,
): Promise<Uint8Array> {
  if (!request.body) {
    throw new GatewayError("Empty request body", 400);
  }

  let decompressedStream: ReadableStream<Uint8Array>;
  try {
    decompressedStream = request.body.pipeThrough(new DecompressionStream(encoding));
  } catch {
    throw new GatewayError("Invalid compressed body", 400);
  }

  return readLimited(
    decompressedStream,
    maxBodySize,
    `Decompressed body too large (exceeds ${maxBodySize} byte limit)`,
    "Invalid compressed body",
  );
}

async function readLimited(
  stream: ReadableStream<Uint8Array>,
  maxBodySize: number,
  tooLargeMessage: string,
  invalidMessage: string,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let totalSize = 0;

  try {
    const reader = stream.getReader();
    // oxlint-disable-next-line no-await-in-loop -- sequential stream reads
    for (let r = await reader.read(); !r.done; r = await reader.read()) {
      totalSize += r.value.byteLength;
      if (maxBodySize > 0 && totalSize > maxBodySize) {
        void reader.cancel();
        throw new GatewayError(tooLargeMessage, 413);
      }
      chunks.push(r.value);
    }
  } catch (error) {
    if (error instanceof GatewayError) throw error;
    throw new GatewayError(invalidMessage, 400);
  }

  if (totalSize === 0) {
    throw new GatewayError("Empty request body", 400);
  }

  if (chunks.length === 1) return chunks[0]!;

  const combined = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

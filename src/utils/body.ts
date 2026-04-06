import { GatewayError } from "../errors/gateway";

/**
 * Supported Content-Encoding values for request body decompression.
 * Uses the Web Compression Streams API (`DecompressionStream`) for runtime portability.
 */
const SUPPORTED_ENCODINGS = new Set(["gzip", "deflate"]);

/**
 * Default maximum request body size (10 MB).
 */
export const DEFAULT_MAX_BODY_SIZE = 10 * 1024 * 1024;

/**
 * Parse a request body as JSON, handling Content-Encoding decompression
 * and enforcing an optional body size limit.
 *
 * @param request - Incoming Web API Request
 * @param maxBodySize - Maximum body size in bytes. `0` disables the limit. Defaults to 1 MB.
 * @returns Parsed JSON body
 */
export function parseRequestBody(
  request: Request,
  maxBodySize: number = DEFAULT_MAX_BODY_SIZE,
): Promise<unknown> {
  const encoding = request.headers.get("content-encoding");

  // Fast path: no encoding — read plain JSON.
  if (!encoding || encoding === "identity") {
    return parsePlainBody(request, maxBodySize);
  }

  // Reject unsupported encodings early.
  if (!SUPPORTED_ENCODINGS.has(encoding)) {
    throw new GatewayError(`Unsupported Content-Encoding: ${encoding}`, 415);
  }

  return parseCompressedBody(request, encoding as CompressionFormat, maxBodySize);
}

async function parsePlainBody(request: Request, maxBodySize: number): Promise<unknown> {
  if (maxBodySize > 0) {
    const contentLength = request.headers.get("content-length");
    if (contentLength !== null) {
      const length = Number(contentLength);
      if (length > maxBodySize) {
        throw new GatewayError(
          `Request body too large (${length} bytes, limit ${maxBodySize})`,
          413,
        );
      }
      // Content-Length present and within limit — use fast arrayBuffer() path.
      const buf = await request.arrayBuffer();
      // Verify actual size in case header lied.
      if (buf.byteLength > maxBodySize) {
        throw new GatewayError(
          `Request body too large (${buf.byteLength} bytes, limit ${maxBodySize})`,
          413,
        );
      }
      return decodeJson(buf);
    }

    // No Content-Length — stream with size enforcement to avoid OOM.
    return parseStreamedPlainBody(request, maxBodySize);
  }

  const buf = await request.arrayBuffer();
  return decodeJson(buf);
}

/**
 * Stream-read a plain request body with incremental size enforcement.
 * Used when Content-Length is absent and a size limit is active.
 */
async function parseStreamedPlainBody(request: Request, maxBodySize: number): Promise<unknown> {
  if (!request.body) {
    throw new GatewayError("Empty request body", 400);
  }

  const chunks: Uint8Array[] = [];
  let totalSize = 0;
  const reader = request.body.getReader();

  // oxlint-disable-next-line no-await-in-loop -- sequential stream reads
  for (let r = await reader.read(); !r.done; r = await reader.read()) {
    totalSize += r.value.byteLength;
    if (totalSize > maxBodySize) {
      void reader.cancel();
      throw new GatewayError(
        `Request body too large (exceeds ${maxBodySize} byte limit)`,
        413,
      );
    }
    chunks.push(r.value);
  }

  if (totalSize === 0) {
    throw new GatewayError("Empty request body", 400);
  }

  // Concatenate and decode.
  if (chunks.length === 1) {
    return decodeJson(chunks[0]);
  }
  const combined = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return decodeJson(combined);
}

function decodeJson(buf: ArrayBuffer | Uint8Array): unknown {
  try {
    const text = new TextDecoder().decode(buf);
    return JSON.parse(text);
  } catch {
    throw new GatewayError("Invalid JSON", 400);
  }
}

async function parseCompressedBody(
  request: Request,
  encoding: CompressionFormat,
  maxBodySize: number,
): Promise<unknown> {
  if (!request.body) {
    throw new GatewayError("Empty request body", 400);
  }

  let decompressedStream: ReadableStream<Uint8Array>;
  try {
    decompressedStream = request.body.pipeThrough(new DecompressionStream(encoding));
  } catch {
    throw new GatewayError("Invalid compressed body", 400);
  }

  // Read decompressed bytes with size enforcement.
  const chunks: Uint8Array[] = [];
  let totalSize = 0;

  try {
    const reader = decompressedStream.getReader();
    // oxlint-disable-next-line no-await-in-loop -- sequential stream reads
    for (let r = await reader.read(); !r.done; r = await reader.read()) {
      totalSize += r.value.byteLength;
      if (maxBodySize > 0 && totalSize > maxBodySize) {
        void reader.cancel();
        throw new GatewayError(
          `Decompressed body too large (exceeds ${maxBodySize} byte limit)`,
          413,
        );
      }
      chunks.push(r.value);
    }
  } catch (error) {
    if (error instanceof GatewayError) throw error;
    throw new GatewayError("Invalid compressed body", 400);
  }

  if (totalSize === 0) {
    throw new GatewayError("Empty request body", 400);
  }

  // Concatenate chunks and parse JSON.
  try {
    let text: string;
    if (chunks.length === 1) {
      text = new TextDecoder().decode(chunks[0]);
    } else {
      const combined = new Uint8Array(totalSize);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.byteLength;
      }
      text = new TextDecoder().decode(combined);
    }
    return JSON.parse(text);
  } catch {
    throw new GatewayError("Invalid JSON", 400);
  }
}

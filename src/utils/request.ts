import pkg from "../../package.json" with { type: "json" };
import { resolveRequestId } from "./headers";

const GATEWAY_VERSION = pkg.version;

const createRequestId = () =>
  "req_" + crypto.getRandomValues(new Uint32Array(2)).reduce((s, n) => s + n.toString(36), "");

export const resolveOrCreateRequestId = (request: Request) =>
  resolveRequestId(request) ?? createRequestId();

export const prepareForwardHeaders = (request: Request): Record<string, string> => {
  const userAgent = request.headers.get("user-agent");
  const appendedUserAgent = userAgent
    ? `${userAgent} @hebo-ai/gateway/${GATEWAY_VERSION}`
    : `@hebo-ai/gateway/${GATEWAY_VERSION}`;

  return {
    "user-agent": appendedUserAgent,
  };
};

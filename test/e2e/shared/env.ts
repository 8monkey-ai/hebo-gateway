// ---------------------------------------------------------------------------
// Bedrock credentials
// ---------------------------------------------------------------------------

export const BEDROCK_ACCESS_KEY_ID = process.env["BEDROCK_ACCESS_KEY_ID"];
export const BEDROCK_SECRET_ACCESS_KEY = process.env["BEDROCK_SECRET_ACCESS_KEY"];
export const BEDROCK_REGION = process.env["BEDROCK_REGION"] ?? "us-east-2";

// ---------------------------------------------------------------------------
// Vertex credentials
// ---------------------------------------------------------------------------

export const GOOGLE_VERTEX_API_KEY = process.env["GOOGLE_VERTEX_API_KEY"];
export const GOOGLE_VERTEX_PROJECT = process.env["GOOGLE_VERTEX_PROJECT"];
export const GOOGLE_VERTEX_LOCATION = process.env["GOOGLE_VERTEX_LOCATION"] ?? "us-central1";

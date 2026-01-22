export interface OpenAICompatibleEmbeddingRequest {
  input: string | string[];
  model: string;
  encoding_format?: "float" | "base64";
  dimensions?: number;
  user?: string;
}

export interface OpenAICompatibleEmbeddingObject {
  object: "embedding";
  embedding: number[];
  index: number;
}

export interface OpenAICompatibleEmbeddingUsage {
  prompt_tokens: number;
  total_tokens: number;
}

export interface OpenAICompatibleEmbeddingResponse {
  object: "list";
  data: OpenAICompatibleEmbeddingObject[];
  model: string;
  usage: OpenAICompatibleEmbeddingUsage;
}

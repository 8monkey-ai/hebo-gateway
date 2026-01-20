// src/oai-compat/schema.ts

export interface OpenAICompatibleModel {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
}

export interface OpenAICompatibleList<T> {
  object: "list";
  data: T[];
}

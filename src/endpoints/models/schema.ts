export interface OpenAICompatibleModel {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
  description?: string;
  architecture?: {
    modality?: string;
    input_modalities: readonly string[];
    output_modalities: readonly string[];
  };
  endpoints: {
    tag: string;
  }[];
  [key: string]: any;
}

export interface OpenAICompatibleList<T> {
  object: "list";
  data: T[];
}

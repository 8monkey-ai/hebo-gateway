export interface OpenAICompatibleModel {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
  description?: string;
  architecture?: {
    modality?: string;
    input_modalities: string[];
    output_modalities: string[];
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

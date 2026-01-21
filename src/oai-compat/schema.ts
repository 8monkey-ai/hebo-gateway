export interface OpenAICompatibleModel {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
  description?: string;
  architecture?: {
    input_modalities: string[];
    output_modalities: string[];
  };
  [key: string]: any;
}

export interface OpenAICompatibleList<T> {
  object: "list";
  data: T[];
}

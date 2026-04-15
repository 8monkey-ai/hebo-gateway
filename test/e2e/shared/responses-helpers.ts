import type OpenAI from "openai";
import type {
  ResponseFunctionToolCall,
  ResponseOutputMessage,
  ResponseOutputText,
} from "openai/resources/responses/responses";

/** Extract the first output_text string from a response. */
export function getOutputText(response: OpenAI.Responses.Response): string {
  const msg = response.output.find((o): o is ResponseOutputMessage => o.type === "message");
  const part = msg?.content.find((c): c is ResponseOutputText => c.type === "output_text");
  return part?.text ?? "";
}

export function getFunctionCall(
  response: OpenAI.Responses.Response,
): ResponseFunctionToolCall | undefined {
  return response.output.find((o): o is ResponseFunctionToolCall => o.type === "function_call");
}

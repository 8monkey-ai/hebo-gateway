import { generateText, streamText } from "ai";
import * as z from "zod/mini";

import type { GatewayConfig, Endpoint } from "../../types";

import { resolveProvider } from "../../providers/registry";
import { createErrorResponse } from "../../utils/errors";
import {
  fromOpenAICompatibleChatCompletionsParams,
  toOpenAICompatibleChatCompletionsResponseBody,
  toOpenAICompatibleStream,
} from "./converters";
import {
  OpenAICompatibleChatCompletionsRequestBodySchema,
  type OpenAICompatibleChatCompletionsResponseBody,
} from "./schema";

export const chatCompletions = (config: GatewayConfig): Endpoint => {
  const { providers, models } = config;
  if (!providers) throw new Error("providers is required");
  if (!models) throw new Error("models is required");

  return {
    handler: (async (req: Request): Promise<Response> => {
      if (req.method !== "POST") {
        return createErrorResponse("METHOD_NOT_ALLOWED", "Method Not Allowed", 405);
      }

      let json;
      try {
        json = await req.json();
      } catch {
        return createErrorResponse("BAD_REQUEST", "Invalid JSON", 400);
      }

      const parsed = OpenAICompatibleChatCompletionsRequestBodySchema.safeParse(json);

      if (!parsed.success) {
        return createErrorResponse(
          "UNPROCESSABLE_ENTITY",
          "Validation error",
          422,
          z.prettifyError(parsed.error),
        );
      }

      const requestBody = parsed.data;
      const { model: modelId, stream, ...params } = requestBody;

      let provider;
      try {
        provider = resolveProvider(providers, models, modelId, "text");
      } catch (error) {
        return createErrorResponse("BAD_REQUEST", (error as Error).message, 400);
      }

      const languageModel = provider.languageModel(modelId);

      const {
        messages,
        tools: toolSet,
        toolChoice,
        providerOptions: rawOptions,
      } = fromOpenAICompatibleChatCompletionsParams(params);

      const providerOptions = {
        [languageModel.provider]: rawOptions,
      };

      if (stream) {
        try {
          const result = await streamText({
            model: languageModel,
            messages,
            tools: toolSet,
            toolChoice,
            providerOptions,
          });

          return new Response(toOpenAICompatibleStream(result, modelId), {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            },
          });
        } catch (error) {
          const errorMessage = (error as Error).message || "Failed to stream text";
          return createErrorResponse("INTERNAL_SERVER_ERROR", errorMessage, 500);
        }
      }

      let generateTextResult;
      try {
        generateTextResult = await generateText({
          model: languageModel,
          messages,
          tools: toolSet,
          toolChoice,
          providerOptions,
        });
      } catch (error) {
        const errorMessage = (error as Error).message || "Failed to generate text";
        return createErrorResponse("INTERNAL_SERVER_ERROR", errorMessage, 500);
      }

      const openAICompatibleResponse: OpenAICompatibleChatCompletionsResponseBody =
        toOpenAICompatibleChatCompletionsResponseBody(generateTextResult, modelId);

      const finalResponse = new Response(JSON.stringify(openAICompatibleResponse), {
        headers: { "Content-Type": "application/json" },
      });

      return finalResponse;
    }) as typeof fetch,
  };
};

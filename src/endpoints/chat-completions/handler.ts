import { generateText, streamText } from "ai";
import * as z from "zod/mini";

import type { GatewayConfig, Endpoint } from "../../types";

import { parseConfig } from "../../config";
import { resolveProvider } from "../../providers/registry";
import { createErrorResponse } from "../../utils/errors";
import { withHooks } from "../../utils/hooks";
import {
  fromOpenAICompatibleChatCompletionsParams,
  toOpenAICompatibleChatCompletionsResponse,
  toOpenAICompatibleStreamResponse,
} from "./converters";
import { OpenAICompatibleChatCompletionsRequestBodySchema } from "./schema";

export const chatCompletions = (config: GatewayConfig): Endpoint => {
  const { providers, models, hooks } = parseConfig(config);

  const handler = async (req: Request): Promise<Response> => {
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

    let resolvedModelId;
    try {
      resolvedModelId = (await hooks?.resolveModelId?.({ modelId })) ?? modelId;
    } catch (error) {
      return createErrorResponse("BAD_REQUEST", error, 400);
    }

    let provider;
    try {
      const args = {
        providers,
        models,
        modelId: resolvedModelId,
        operation: "text" as const,
      };
      const override = await hooks?.resolveProvider?.(args);
      provider = override ?? resolveProvider(args);
    } catch (error) {
      return createErrorResponse("BAD_REQUEST", error, 400);
    }

    const languageModel = provider.languageModel(resolvedModelId);

    let messages, rawOptions, temperature, toolChoice, toolSet;
    try {
      ({
        messages,
        providerOptions: rawOptions,
        temperature,
        toolChoice,
        tools: toolSet,
      } = fromOpenAICompatibleChatCompletionsParams(params));
    } catch (error) {
      return createErrorResponse("BAD_REQUEST", error, 400);
    }

    const providerOptions = {
      [languageModel.provider]: rawOptions,
    };

    if (stream) {
      try {
        const result = streamText({
          model: languageModel,
          messages,
          tools: toolSet,
          toolChoice,
          temperature,
          providerOptions,
        });

        return toOpenAICompatibleStreamResponse(result, modelId);
      } catch (error) {
        return createErrorResponse("INTERNAL_SERVER_ERROR", error, 500);
      }
    }

    let generateTextResult;
    try {
      generateTextResult = await generateText({
        model: languageModel,
        messages,
        tools: toolSet,
        toolChoice,
        temperature,
        providerOptions,
      });
    } catch (error) {
      return createErrorResponse("INTERNAL_SERVER_ERROR", error, 500);
    }

    return toOpenAICompatibleChatCompletionsResponse(generateTextResult, modelId);
  };

  return { handler: withHooks(hooks, handler) };
};

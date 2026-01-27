import { generateText, streamText } from "ai";
import * as z from "zod/mini";

import type { GatewayConfig, Endpoint } from "../../types";

import { parseConfig } from "../../config";
import { resolveProvider } from "../../providers/registry";
import { createErrorResponse } from "../../utils/errors";
import { withHooks } from "../../utils/hooks";
import {
  transformCompletionsInputs,
  createCompletionsResponse,
  createCompletionsStreamResponse,
} from "./converters";
import { CompletionsBodySchema } from "./schema";

export const chatCompletions = (config: GatewayConfig): Endpoint => {
  const { providers, models, hooks } = parseConfig(config);

  const handler = async (req: Request): Promise<Response> => {
    if (req.method !== "POST") {
      return createErrorResponse("METHOD_NOT_ALLOWED", "Method Not Allowed", 405);
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return createErrorResponse("BAD_REQUEST", "Invalid JSON", 400);
    }

    const parsed = CompletionsBodySchema.safeParse(body);

    if (!parsed.success) {
      return createErrorResponse(
        "UNPROCESSABLE_ENTITY",
        "Validation error",
        422,
        z.prettifyError(parsed.error),
      );
    }

    const { model: modelId, stream, ...inputs } = parsed.data;

    let resolvedModelId;
    try {
      resolvedModelId = (await hooks?.resolveModelId?.({ modelId })) ?? modelId;
    } catch (error) {
      return createErrorResponse("BAD_REQUEST", error, 400);
    }

    let textOptions;
    try {
      textOptions = transformCompletionsInputs(inputs);
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

    if (stream) {
      let result;
      try {
        result = streamText({
          model: languageModel,
          ...textOptions,
        });
      } catch (error) {
        return createErrorResponse("INTERNAL_SERVER_ERROR", error, 500);
      }

      return createCompletionsStreamResponse(result, modelId);
    }

    let result;
    try {
      result = await generateText({
        model: languageModel,
        ...textOptions,
      });
    } catch (error) {
      return createErrorResponse("INTERNAL_SERVER_ERROR", error, 500);
    }

    return createCompletionsResponse(result, modelId);
  };

  return { handler: withHooks(hooks, handler) };
};

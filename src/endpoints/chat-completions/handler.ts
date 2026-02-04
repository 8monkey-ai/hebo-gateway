import { generateText, streamText, wrapLanguageModel } from "ai";
import * as z from "zod/mini";

import type {
  GatewayConfig,
  Endpoint,
  GatewayContext,
  ResolveProviderHookContext,
  ResolveModelHookContext,
} from "../../types";

import { withLifecycle } from "../../lifecycle";
import { forwardParamsMiddleware } from "../../middleware/common";
import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { resolveProvider } from "../../providers/registry";
import { createErrorResponse } from "../../utils/errors";
import { logger } from "../../utils/logger";
import {
  convertToTextCallOptions,
  toChatCompletionsResponse,
  toChatCompletionsStreamResponse,
} from "./converters";
import { ChatCompletionsBodySchema } from "./schema";

export const chatCompletions = (config: GatewayConfig): Endpoint => {
  const hooks = config.hooks;

  const handler = async (ctx: GatewayContext): Promise<Response> => {
    if (!ctx.request || ctx.request.method !== "POST") {
      return createErrorResponse("METHOD_NOT_ALLOWED", "Method Not Allowed", 405);
    }

    let body;
    try {
      body = await ctx.request.json();
    } catch {
      return createErrorResponse("BAD_REQUEST", "Invalid JSON", 400);
    }

    const parsed = ChatCompletionsBodySchema.safeParse(body);
    if (!parsed.success) {
      return createErrorResponse(
        "UNPROCESSABLE_ENTITY",
        "Validation error",
        422,
        z.prettifyError(parsed.error),
      );
    }
    ctx.body = parsed.data;

    let inputs, stream;
    ({ model: ctx.modelId, stream, ...inputs } = parsed.data);

    try {
      ctx.resolvedModelId =
        (await hooks?.resolveModelId?.(ctx as ResolveModelHookContext)) ?? ctx.modelId;
    } catch (error) {
      return createErrorResponse("BAD_REQUEST", error, 400);
    }
    logger.debug(`[chat] model resolved: ${ctx.modelId} -> ${ctx.resolvedModelId}`);

    ctx.operation = "text";
    try {
      const override = await hooks?.resolveProvider?.(ctx as ResolveProviderHookContext);
      ctx.provider =
        override ??
        resolveProvider({
          providers: ctx.providers,
          models: ctx.models,
          modelId: ctx.resolvedModelId,
          operation: ctx.operation,
        });
    } catch (error) {
      return createErrorResponse("BAD_REQUEST", error, 400);
    }

    const languageModel = ctx.provider.languageModel(ctx.resolvedModelId);
    logger.debug(`[chat] provider resolved: ${ctx.resolvedModelId} -> ${languageModel.provider}`);

    let textOptions;
    try {
      textOptions = convertToTextCallOptions(inputs);
    } catch (error) {
      return createErrorResponse("BAD_REQUEST", error, 400);
    }

    const middleware = [];
    for (const m of modelMiddlewareMatcher.forModel(ctx.resolvedModelId)) middleware.push(m);
    middleware.push(forwardParamsMiddleware(languageModel.provider));
    for (const m of modelMiddlewareMatcher.forProvider(languageModel.provider)) middleware.push(m);

    const languageModelWithMiddleware = wrapLanguageModel({
      model: languageModel,
      middleware,
    });

    if (stream) {
      let result;
      try {
        result = streamText({
          model: languageModelWithMiddleware,
          ...textOptions,
        });
      } catch (error) {
        return createErrorResponse("INTERNAL_SERVER_ERROR", error, 500);
      }

      return toChatCompletionsStreamResponse(result, ctx.modelId);
    }

    let result;
    try {
      result = await generateText({
        model: languageModelWithMiddleware,
        ...textOptions,
      });
    } catch (error) {
      return createErrorResponse("INTERNAL_SERVER_ERROR", error, 500);
    }

    return toChatCompletionsResponse(result, ctx.modelId);
  };

  return { handler: withLifecycle(handler, config) };
};

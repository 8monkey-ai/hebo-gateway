import { generateText, streamText, wrapLanguageModel } from "ai";
import * as z from "zod/mini";

import type {
  GatewayConfig,
  Endpoint,
  GatewayContext,
  ResolveProviderHookContext,
  ResolveModelHookContext,
} from "../../types";

import { createHandler } from "../../lifecycle";
import { forwardParamsMiddleware } from "../../middleware/common";
import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { resolveProvider } from "../../providers/registry";
import { GatewayError } from "../../utils/errors";
import { logger } from "../../utils/logger";
import { prepareForwardHeaders } from "../../utils/request";
import { convertToTextCallOptions, toChatCompletions, toChatCompletionsStream } from "./converters";
import { ChatCompletionsBodySchema } from "./schema";

export const chatCompletions = (config: GatewayConfig): Endpoint => {
  const hooks = config.hooks;

  const handler = async (ctx: GatewayContext) => {
    // Guard: enforce HTTP method early.
    if (!ctx.request || ctx.request.method !== "POST") {
      throw new GatewayError("Method Not Allowed", 405);
    }

    // Parse + validate input.
    let body;
    try {
      body = await ctx.request.json();
    } catch {
      throw new GatewayError("Invalid JSON", 400);
    }

    const parsed = ChatCompletionsBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new GatewayError(z.prettifyError(parsed.error), 400);
    }
    ctx.body = parsed.data;

    // Resolve model + provider (hooks may override defaults).
    let inputs, stream;
    ({ model: ctx.modelId, stream, ...inputs } = parsed.data);

    ctx.resolvedModelId =
      (await hooks?.resolveModelId?.(ctx as ResolveModelHookContext)) ?? ctx.modelId;
    logger.debug(`chat: model resolved: ${ctx.modelId} -> ${ctx.resolvedModelId}`);

    ctx.operation = "text";
    const override = await hooks?.resolveProvider?.(ctx as ResolveProviderHookContext);
    ctx.provider =
      override ??
      resolveProvider({
        providers: ctx.providers,
        models: ctx.models,
        modelId: ctx.resolvedModelId,
        operation: ctx.operation,
      });

    const languageModel = ctx.provider.languageModel(ctx.resolvedModelId);
    ctx.resolvedProviderId = languageModel.provider;
    logger.debug(`chat: provider resolved: ${ctx.resolvedModelId} -> ${languageModel.provider}`);

    // Convert inputs to AI SDK call options.
    const textOptions = convertToTextCallOptions(inputs);

    // Build middleware chain (model -> forward params -> provider).
    const middleware = [];
    for (const m of modelMiddlewareMatcher.forModel(ctx.resolvedModelId)) middleware.push(m);
    middleware.push(forwardParamsMiddleware(languageModel.provider));
    for (const m of modelMiddlewareMatcher.forProvider(languageModel.provider)) middleware.push(m);

    const languageModelWithMiddleware = wrapLanguageModel({
      model: languageModel,
      middleware,
    });

    // Execute request (streaming vs. non-streaming).
    if (stream) {
      const result = streamText({
        model: languageModelWithMiddleware,
        headers: prepareForwardHeaders(ctx.request),
        abortSignal: ctx.request.signal,
        onError: ({ error }) => {
          logger.error(error instanceof Error ? error : new Error(String(error)), {
            requestId: ctx.request.headers.get("x-request-id"),
          });
        },
        ...textOptions,
      });

      return toChatCompletionsStream(result, ctx.modelId);
    }

    const result = await generateText({
      model: languageModelWithMiddleware,
      headers: prepareForwardHeaders(ctx.request),
      abortSignal: ctx.request.signal,
      ...textOptions,
    });

    return toChatCompletions(result, ctx.modelId);
  };

  return { handler: createHandler(handler, config) };
};

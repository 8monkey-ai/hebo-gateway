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
import { GatewayError } from "../../utils/errors";
import { logger } from "../../utils/logger";
import {
  convertToTextCallOptions,
  toChatCompletionsResponse,
  toChatCompletionsStream,
} from "./converters";
import { ChatCompletionsBodySchema } from "./schema";
import { mergeResponseInit } from "../../utils/response";

export const chatCompletions = (config: GatewayConfig): Endpoint => {
  const hooks = config.hooks;

  const handler = async (ctx: GatewayContext): Promise<Response> => {
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
      throw new GatewayError(z.prettifyError(parsed.error), 400, "UNPROCESSABLE_ENTITY");
    }
    ctx.body = parsed.data;

    // Resolve model + provider (hooks may override defaults).
    let inputs, stream;
    ({ model: ctx.modelId, stream, ...inputs } = parsed.data);

    ctx.resolvedModelId =
      (await hooks?.resolveModelId?.(ctx as ResolveModelHookContext)) ?? ctx.modelId;
    logger.debug(`[chat] model resolved: ${ctx.modelId} -> ${ctx.resolvedModelId}`);

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
    logger.debug(`[chat] provider resolved: ${ctx.resolvedModelId} -> ${languageModel.provider}`);

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
      const abortController = new AbortController();
      const requestSignal = ctx.request.signal;

      if (requestSignal.aborted) {
        abortController.abort(requestSignal.reason);
      } else {
        requestSignal.addEventListener(
          "abort",
          () => abortController.abort(requestSignal.reason),
          { once: true },
        );
      }

      const effectiveAbortSignal =
        typeof AbortSignal !== "undefined" && "any" in AbortSignal
          ? AbortSignal.any([requestSignal, abortController.signal])
          : abortController.signal;

      const result = streamText({
        model: languageModelWithMiddleware,
        abortSignal: effectiveAbortSignal,
        ...textOptions,
      });

      const stream = toChatCompletionsStream(result, ctx.modelId);
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

      const wrapped = new ReadableStream<Uint8Array>({
        start(controller) {
          reader = stream.getReader();
          const pump = (): void => {
            reader!
              .read()
              .then(({ done, value }) => {
                if (done) {
                  controller.close();
                  return;
                }
                controller.enqueue(value);
                pump();
              })
              .catch((err) => controller.error(err));
          };
          pump();
        },
        cancel(reason) {
          abortController.abort(reason);
          return reader?.cancel(reason);
        },
      });

      return new Response(
        wrapped,
        mergeResponseInit(
          {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        ),
      );
    }

    const result = await generateText({
      model: languageModelWithMiddleware,
      abortSignal: ctx.request.signal,
      ...textOptions,
    });

    return toChatCompletionsResponse(result, ctx.modelId);
  };

  return { handler: withLifecycle(handler, config) };
};

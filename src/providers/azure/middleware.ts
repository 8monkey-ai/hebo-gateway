import { modelMiddlewareMatcher } from "../../middleware/matcher";
import type { TranscriptionModelMiddleware } from "../../middleware/transcription";

// Azure OpenAI transcription deployments only read `openai` provider options, while the
// Azure Speech / MAI APIs (selected via `api`) read `azure` options.
// FUTURE: Remove this remapping once Azure OpenAI accepts `azure` options:
// https://github.com/vercel/ai/issues/23488
export const azureTranscriptionOptionsMiddleware: TranscriptionModelMiddleware = {
  transformParams: ({ params }) => {
    const { azure, ...providerOptions } = params.providerOptions ?? {};
    if (!azure) return params;

    const { api, ...options } = azure;
    if (api !== undefined && api !== "openai") return params;

    providerOptions["openai"] = { ...providerOptions["openai"], ...options };
    if (api !== undefined) providerOptions["azure"] = { api };

    return { ...params, providerOptions };
  },
};

modelMiddlewareMatcher.useForProvider("azure.transcription", {
  transcription: [azureTranscriptionOptionsMiddleware],
});

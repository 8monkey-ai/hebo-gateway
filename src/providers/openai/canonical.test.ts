import { expect, test } from "bun:test";

import { createOpenAI } from "@ai-sdk/openai";

import { withCanonicalIdsForOpenAI } from "./canonical";

const openai = createOpenAI({ apiKey: "test-key" });

test("withCanonicalIdsForOpenAI > strips the namespace for transcription models", () => {
  const provider = withCanonicalIdsForOpenAI(openai);

  const model = provider.transcriptionModel!("openai/gpt-transcribe");
  expect(model.modelId).toBe("gpt-transcribe");
  expect(model.provider).toBe("openai.transcription");
});

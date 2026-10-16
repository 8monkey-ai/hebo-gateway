import { expect, test } from "bun:test";

import { createOpenAI } from "@ai-sdk/openai";

import { withCanonicalIdsForOpenAI } from "./canonical";

const openai = createOpenAI({ apiKey: "test-key" });

test("withCanonicalIdsForOpenAI > strips the namespace for transcription models", () => {
  const provider = withCanonicalIdsForOpenAI(openai);

  const whisper = provider.transcriptionModel!("openai/whisper-1");
  expect(whisper.modelId).toBe("whisper-1");
  expect(whisper.provider).toBe("openai.transcription");

  const gpt4o = provider.transcriptionModel!("openai/gpt-4o-transcribe");
  expect(gpt4o.modelId).toBe("gpt-4o-transcribe");
});

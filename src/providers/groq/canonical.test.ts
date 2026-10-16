import { expect, test } from "bun:test";

import { createGroq } from "@ai-sdk/groq";

import { withCanonicalIdsForGroq } from "./canonical";

const groq = createGroq({ apiKey: "test-key" });

test("withCanonicalIdsForGroq > maps meta/llama-3.3-70b via explicit mapping", () => {
  const provider = withCanonicalIdsForGroq(groq);
  expect(provider.languageModel("meta/llama-3.3-70b").modelId).toBe("llama-3.3-70b-versatile");
});

test("withCanonicalIdsForGroq > maps whisper transcription models", () => {
  const provider = withCanonicalIdsForGroq(groq);

  const v3 = provider.transcriptionModel!("openai/whisper-large-v3");
  expect(v3.modelId).toBe("whisper-large-v3");
  expect(v3.provider).toBe("groq.transcription");

  const turbo = provider.transcriptionModel!("openai/whisper-large-v3-turbo");
  expect(turbo.modelId).toBe("whisper-large-v3-turbo");
});

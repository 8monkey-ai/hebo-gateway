import { MockProviderV3 } from "ai/test";
import { describe, expect, test } from "bun:test";

import { parseResponse, postJson } from "../../../test/helpers/http";
import { defineModelCatalog } from "../../models/catalog";
import { InMemoryStorage } from "../../storage/memory";
import { conversations } from "./handler";

describe("Conversations Handler", () => {
  const config = {
    providers: {
      dummy: new MockProviderV3(),
    },
    models: defineModelCatalog({
      "dummy-model": {
        name: "Dummy Model",
        modalities: { input: ["text"], output: ["text"] },
        providers: ["dummy"],
      },
    }),
    storage: new InMemoryStorage(),
  };

  test("should create a conversation", async () => {
    const endpoint = conversations(config as any);
    const request = postJson("http://localhost/conversations", {
      metadata: { user_id: "123" },
    });
    const res = await endpoint.handler(request);
    expect(res.status).toBe(200);
    const data = await parseResponse(res);
    expect(data).toMatchObject({
      id: expect.stringMatching(/^conv_/),
      object: "conversation",
      metadata: { user_id: "123" },
    });
  });

  test("should add items to a conversation", async () => {
    const storage = new InMemoryStorage();
    const conv = await storage.createConversation({});
    const endpoint = conversations({ ...config, storage } as any);

    const request = postJson(`http://localhost/conversations/${conv.id}/items`, {
      items: [{ role: "user", content: "Hello" }],
    });
    const res = await endpoint.handler(request);
    expect(res.status).toBe(200);
    const data = await parseResponse(res);

    expect(data.object).toBe("list");
    expect(data.data[0]).toMatchObject({
      role: "user",
      content: "Hello",
    });
  });

  test("should list items in a conversation", async () => {
    const storage = new InMemoryStorage();
    const conv = await storage.createConversation({});
    await storage.addItems(conv.id, [{ role: "user", content: "Hello" }]);

    const endpoint = conversations({ ...config, storage } as any);
    const request = new Request(`http://localhost/conversations/${conv.id}/items`);
    const res = await endpoint.handler(request);
    expect(res.status).toBe(200);
    const data = await parseResponse(res);

    expect(data.data).toHaveLength(1);
    expect(data.data[0].content).toBe("Hello");
  });
});

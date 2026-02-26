import { MockProviderV3 } from "ai/test";
import { describe, expect, test } from "bun:test";

import { parseResponse, postJson } from "../../../test/helpers/http";
import { defineModelCatalog } from "../../models/catalog";
import { conversations } from "./handler";
import { type ResponseInputItem } from "./schema";
import { InMemoryStorage } from "./storage/memory";
import { createConversation, createConversationItem } from "./utils";

describe("Conversations Handler", () => {
  const config = {
    providers: {
      groq: new MockProviderV3(),
    },
    models: defineModelCatalog({
      "openai/gpt-oss-20b": {
        name: "GPT-OSS 20B",
        modalities: { input: ["text", "file"], output: ["text"] },
        providers: ["groq"],
      },
    }),
    storage: new InMemoryStorage(),
  };

  test("should handle full conversation lifecycle", async () => {
    const endpoint = conversations(config);

    // 1. Create
    const createReq = postJson("http://localhost/conversations", {
      metadata: { initial: "true" },
    });
    const createRes = await endpoint.handler(createReq);
    expect(createRes.status).toBe(200);
    const conv = await parseResponse(createRes);
    const convId = conv.id;

    // 2. Retrieve
    const retrieveRes = await endpoint.handler(
      new Request(`http://localhost/conversations/${convId}`),
    );
    expect(retrieveRes.status).toBe(200);
    const retrieved = await parseResponse(retrieveRes);
    expect(retrieved.metadata.initial).toBe("true");

    // 3. Update
    const updateReq = postJson(`http://localhost/conversations/${convId}`, {
      metadata: { updated: "true" },
    });
    const updateRes = await endpoint.handler(updateReq);
    expect(updateRes.status).toBe(200);
    const updated = await parseResponse(updateRes);
    expect(updated.metadata.updated).toBe("true");

    // 4. Delete
    const deleteRes = await endpoint.handler(
      new Request(`http://localhost/conversations/${convId}`, { method: "DELETE" }),
    );
    expect(deleteRes.status).toBe(200);
    const deleted = await parseResponse(deleteRes);
    expect(deleted.object).toBe("conversation.deleted");

    // 5. Verify retrieval fails
    const finalRetrieveRes = await endpoint.handler(
      new Request(`http://localhost/conversations/${convId}`),
    );
    expect(finalRetrieveRes.status).toBe(404);
  });

  test("should manage individual items", async () => {
    const endpoint = conversations(config);
    const storage = endpoint._parsedConfig?.storage ?? config.storage;

    const conv = createConversation({});
    await storage.createConversation(conv);
    const items = (
      [
        { type: "message", role: "user", content: "Message 1" },
        { type: "message", role: "user", content: "Message 2" },
      ] as ResponseInputItem[]
    ).map((item) => createConversationItem(item));
    await storage.addItems(conv.id, items);
    const item1Id = items[0].id;
    const item2Id = items[1].id;

    // 1. Retrieve Single Item
    const getRes = await endpoint.handler(
      new Request(`http://localhost/conversations/${conv.id}/items/${item1Id}`),
    );
    expect(getRes.status).toBe(200);
    const itemData = await parseResponse(getRes);
    expect(itemData.content).toBe("Message 1");

    // 2. List with Limit & Order
    const listRes = await endpoint.handler(
      new Request(`http://localhost/conversations/${conv.id}/items?limit=1&order=desc`),
    );
    const listData = await parseResponse(listRes);
    expect(listData.data).toHaveLength(1);
    expect(listData.data[0].id).toBe(item2Id);

    // 3. Delete Single Item (Returns parent conversation)
    const delRes = await endpoint.handler(
      new Request(`http://localhost/conversations/${conv.id}/items/${item1Id}`, {
        method: "DELETE",
      }),
    );
    expect(delRes.status).toBe(200);
    const delData = await parseResponse(delRes);
    expect(delData.id).toBe(conv.id);
    expect(delData.object).toBe("conversation");

    // 4. Verify deletion
    const finalItemsRes = await endpoint.handler(
      new Request(`http://localhost/conversations/${conv.id}/items`),
    );
    const finalItemsData = await parseResponse(finalItemsRes);
    expect(finalItemsData.data).toHaveLength(1);
    expect(finalItemsData.data[0].id).toBe(item2Id);
  });

  test("should handle pagination (has_more)", async () => {
    const endpoint = conversations(config);
    const storage = (endpoint as any)._parsedConfig?.storage ?? config.storage;

    const conv = createConversation({});
    await storage.createConversation(conv);
    const items = Array.from(
      { length: 5 },
      (_, i) =>
        ({
          type: "message",
          role: "user",
          content: `Msg ${i + 1}`,
        }) as ResponseInputItem,
    ).map((item) => createConversationItem(item));
    await storage.addItems(conv.id, items);

    const res = await endpoint.handler(
      new Request(`http://localhost/conversations/${conv.id}/items?limit=3&order=asc`),
    );
    const data = await parseResponse(res);
    expect(data.data).toHaveLength(3);
    expect(data.has_more).toBe(true);
    expect(data.data[0].content).toBe("Msg 1");

    const res2 = await endpoint.handler(
      new Request(`http://localhost/conversations/${conv.id}/items?limit=5&order=asc`),
    );
    const data2 = await parseResponse(res2);
    expect(data2.data).toHaveLength(5);
    expect(data2.has_more).toBe(false);

    const res3 = await endpoint.handler(
      new Request(`http://localhost/conversations/${conv.id}/items?limit=10&order=asc`),
    );
    const data3 = await parseResponse(res3);
    expect(data3.data).toHaveLength(5);
    expect(data3.has_more).toBe(false);
  });

  test("should enforce limit constraints", async () => {
    const endpoint = conversations(config);
    const storage = (endpoint as any)._parsedConfig?.storage ?? config.storage;

    const conv = createConversation({});
    await storage.createConversation(conv);

    // Limit too high
    const resHigh = await endpoint.handler(
      new Request(`http://localhost/conversations/${conv.id}/items?limit=101`),
    );
    expect(resHigh.status).toBe(400);

    // Limit too low
    const resLow = await endpoint.handler(
      new Request(`http://localhost/conversations/${conv.id}/items?limit=0`),
    );
    expect(resLow.status).toBe(400);

    // Limit not a number
    const resNan = await endpoint.handler(
      new Request(`http://localhost/conversations/${conv.id}/items?limit=abc`),
    );
    expect(resNan.status).toBe(400);
  });

  test("should enforce metadata limits", async () => {
    const endpoint = conversations(config);
    const tooManyMetadata: Record<string, string> = {};
    for (let i = 0; i < 17; i++) tooManyMetadata[`key${i}`] = "value";

    const request = postJson("http://localhost/conversations", {
      metadata: tooManyMetadata,
    });
    const res = await endpoint.handler(request);
    expect(res.status).toBe(400);
  });

  test("should handle mounted subpaths", async () => {
    const endpoint = conversations(config);

    // Simulate a request mounted under /api/v1/conversations
    const createReq = postJson("http://localhost/api/v1/conversations", {
      metadata: { subpath: "true" },
    });
    const createRes = await endpoint.handler(createReq);
    expect(createRes.status).toBe(200);
    const conv = await parseResponse(createRes);
    expect(conv.metadata.subpath).toBe("true");

    const retrieveRes = await endpoint.handler(
      new Request(`http://localhost/api/v1/conversations/${conv.id}`),
    );
    expect(retrieveRes.status).toBe(200);
    const retrieved = await parseResponse(retrieveRes);
    expect(retrieved.id).toBe(conv.id);
  });

  test("should maintain IDs from input", async () => {
    const endpoint = conversations(config);

    // 1. Maintain item ID during addItems
    const conv = createConversation({});
    const storage = (endpoint as any)._parsedConfig?.storage ?? config.storage;
    await storage.createConversation(conv);

    const customItemId = "item_custom_123";
    const addItemsReq = postJson(`http://localhost/conversations/${conv.id}/items`, {
      items: [{ id: customItemId, type: "message", role: "user", content: "Hello" }],
    });
    const addItemsRes = await endpoint.handler(addItemsReq);
    expect(addItemsRes.status).toBe(200);
    const addItemsData = await parseResponse(addItemsRes);
    expect(addItemsData.data[0].id).toBe(customItemId);

    // 2. Maintain item IDs during conversation create
    const createReq = postJson("http://localhost/conversations", {
      items: [{ id: "msg_1", type: "message", role: "user", content: "First" }],
    });
    const createRes = await endpoint.handler(createReq);
    expect(createRes.status).toBe(200);
    const newConv = await parseResponse(createRes);

    const listRes = await endpoint.handler(
      new Request(`http://localhost/conversations/${newConv.id}/items`),
    );
    const listData = await parseResponse(listRes);
    expect(listData.data[0].id).toBe("msg_1");
  });
});

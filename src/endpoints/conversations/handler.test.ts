import { beforeEach, describe, expect, test } from "bun:test";

import { MockProviderV3 } from "ai/test";

import { parseResponse, postJson } from "../../../test/helpers/http";
import { defineModelCatalog } from "../../models/catalog";
import { type GatewayConfig } from "../../types";
import { type ResponsesInputItem } from "../responses/schema";
import { conversations } from "./handler";
import {
  type Conversation,
  type ConversationDeleted,
  type ConversationItem,
  type ConversationItemList,
} from "./schema";
import { InMemoryStorage } from "./storage/memory";

describe("Conversations Handler", () => {
  let config: GatewayConfig;

  beforeEach(() => {
    config = {
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
  });

  test("should handle full conversation lifecycle", async () => {
    const endpoint = conversations(config);

    // 1. Create
    const createReq = postJson("http://localhost/conversations", {
      metadata: { initial: "true" },
    });
    const createRes = await endpoint.handler(createReq);
    expect(createRes.status).toBe(200);
    const conv = (await parseResponse<Conversation>(createRes))!;
    const convId = conv.id;

    // 2. Retrieve
    const retrieveRes = await endpoint.handler(
      new Request(`http://localhost/conversations/${convId}`),
    );
    expect(retrieveRes.status).toBe(200);
    const retrieved = (await parseResponse<Conversation>(retrieveRes))!;
    expect(retrieved.metadata!["initial"]).toBe("true");

    // 3. Update
    const updateReq = postJson(`http://localhost/conversations/${convId}`, {
      metadata: { updated: "true" },
    });
    const updateRes = await endpoint.handler(updateReq);
    expect(updateRes.status).toBe(200);
    const updated = (await parseResponse<Conversation>(updateRes))!;
    expect(updated.metadata!["updated"]).toBe("true");

    // 4. Update with null metadata
    const updateNullReq = postJson(`http://localhost/conversations/${convId}`, {
      metadata: null,
    });
    const updateNullRes = await endpoint.handler(updateNullReq);
    expect(updateNullRes.status).toBe(200);
    const updatedNull = (await parseResponse<Conversation>(updateNullRes))!;
    expect(updatedNull.metadata).toBeNull();

    // 5. Update with missing metadata (should default to null)
    const updateMissingReq = postJson(`http://localhost/conversations/${convId}`, {});
    const updateMissingRes = await endpoint.handler(updateMissingReq);
    expect(updateMissingRes.status).toBe(200);
    const updatedMissing = (await parseResponse<Conversation>(updateMissingRes))!;
    expect(updatedMissing.metadata).toBeNull();

    // 6. Delete
    const deleteRes = await endpoint.handler(
      new Request(`http://localhost/conversations/${convId}`, { method: "DELETE" }),
    );
    expect(deleteRes.status).toBe(200);
    const deleted = (await parseResponse<ConversationDeleted>(deleteRes))!;
    expect(deleted.object).toBe("conversation.deleted");

    // 5. Verify retrieval fails
    const finalRetrieveRes = await endpoint.handler(
      new Request(`http://localhost/conversations/${convId}`),
    );
    expect(finalRetrieveRes.status).toBe(404);
  });

  test("should list conversations and filter by metadata", async () => {
    const endpoint = conversations(config);

    // 1. Create conversations with different metadata
    await endpoint.handler(
      postJson("http://localhost/conversations", {
        metadata: { user_id: "user_1", project: "a" },
      }),
    );
    await endpoint.handler(
      postJson("http://localhost/conversations", {
        metadata: { user_id: "user_1", project: "b" },
      }),
    );
    await endpoint.handler(
      postJson("http://localhost/conversations", {
        metadata: { user_id: "user_2", project: "a" },
      }),
    );

    // 2. List all
    const resAll = await endpoint.handler(new Request("http://localhost/conversations"));
    const dataAll = (await parseResponse<{ data: Conversation[] }>(resAll))!;
    expect(dataAll.data).toHaveLength(3);

    // 3. Filter by user_id
    const resUser1 = await endpoint.handler(
      new Request("http://localhost/conversations?metadata.user_id=user_1"),
    );
    const dataUser1 = (await parseResponse<{ data: Conversation[] }>(resUser1))!;
    expect(dataUser1.data).toHaveLength(2);
    expect(dataUser1.data.every((c) => c.metadata?.["user_id"] === "user_1")).toBe(true);

    // 4. Filter by project
    const resProjectB = await endpoint.handler(
      new Request("http://localhost/conversations?metadata.project=b"),
    );
    const dataProjectB = (await parseResponse<{ data: Conversation[] }>(resProjectB))!;
    expect(dataProjectB.data).toHaveLength(1);
    expect(dataProjectB.data[0]?.metadata?.["project"]).toBe("b");

    // 5. Multi-key filter (AND)
    const resBoth = await endpoint.handler(
      new Request("http://localhost/conversations?metadata.user_id=user_1&metadata.project=a"),
    );
    const dataBoth = (await parseResponse<{ data: Conversation[] }>(resBoth))!;
    expect(dataBoth.data).toHaveLength(1);
    expect(dataBoth.data[0]?.metadata?.["user_id"]).toBe("user_1");
    expect(dataBoth.data[0]?.metadata?.["project"]).toBe("a");

    // 6. Non-existent filter
    const resNone = await endpoint.handler(
      new Request("http://localhost/conversations?metadata.user_id=user_99"),
    );
    const dataNone = (await parseResponse<{ data: Conversation[] }>(resNone))!;
    expect(dataNone.data).toHaveLength(0);
  });

  test("should preserve extra payload (cache_control, extra_content) across all item types", async () => {
    const endpoint = conversations(config);

    const itemsToTest = [
      {
        type: "message",
        role: "system",
        content: "You are a helpful assistant.",
        cache_control: { type: "ephemeral" },
      },
      {
        type: "message",
        role: "user",
        content: "What is the weather in London?",
        cache_control: { type: "ephemeral" },
      },
      {
        type: "message",
        role: "assistant",
        content: "Let me check that for you.",
        extra_content: { vertex: { thought_signature: "sig_assistant_123" } },
      },
      {
        type: "function_call",
        call_id: "call_123",
        name: "get_weather",
        arguments: '{"location": "London"}',
        extra_content: { vertex: { thought_signature: "sig_call_456" } },
      },
      {
        type: "function_call_output",
        call_id: "call_123",
        output: "Rainy, 15°C",
      },
    ] satisfies ResponsesInputItem[];

    // 1. Create conversation with these items
    const createRes = await endpoint.handler(
      postJson("http://localhost/conversations", {
        items: itemsToTest,
      }),
    );
    expect(createRes.status).toBe(200);
    const conv = (await parseResponse<Conversation>(createRes))!;

    // 2. Retrieve items and verify all flexible fields are preserved at root
    const itemsRes = await endpoint.handler(
      new Request(`http://localhost/conversations/${conv.id}/items?order=asc`),
    );
    const items = (await parseResponse<ConversationItemList>(itemsRes))!;
    expect(items.data).toHaveLength(5);

    const [sys, user, assistant, call] = items.data;

    // Verify messages
    expect(sys).toMatchObject({ cache_control: { type: "ephemeral" } });
    expect(user).toMatchObject({ cache_control: { type: "ephemeral" } });
    expect(assistant).toMatchObject({
      extra_content: { vertex: { thought_signature: "sig_assistant_123" } },
    });

    // Verify function items
    expect(call).toMatchObject({
      extra_content: { vertex: { thought_signature: "sig_call_456" } },
    });
  });

  test("should preserve extra payload when adding items to existing conversation", async () => {
    const endpoint = conversations(config);

    // 1. Create empty conversation
    const createRes = await endpoint.handler(postJson("http://localhost/conversations", {}));
    const conv = (await parseResponse<Conversation>(createRes))!;

    // 2. Add an item with cache_control
    const addItemRes = await endpoint.handler(
      postJson(`http://localhost/conversations/${conv.id}/items`, {
        items: [
          {
            type: "message",
            role: "user",
            content: "Hello",
            cache_control: { type: "ephemeral" },
          },
        ] satisfies ResponsesInputItem[],
      }),
    );
    expect(addItemRes.status).toBe(200);

    // 3. Verify item was saved with cache_control
    const itemsRes = await endpoint.handler(
      new Request(`http://localhost/conversations/${conv.id}/items`),
    );
    const items = (await parseResponse<ConversationItemList>(itemsRes))!;
    const item = items.data[0]!;

    expect(item).toMatchObject({
      role: "user",
      cache_control: { type: "ephemeral" },
    });
  });

  test("should reject invalid metadata", async () => {
    const endpoint = conversations(config);

    // 1. Invalid value type (number)
    const req1 = postJson("http://localhost/conversations", {
      metadata: { count: 123 },
    });
    const res1 = await endpoint.handler(req1);
    expect(res1.status).toBe(400);
  });

  test("should manage individual items", async () => {
    const endpoint = conversations(config);
    const storage = config.storage!;

    const conv = await storage.createConversation({});
    const itemInputs = [
      { type: "message", role: "user", content: "Message 1" },
      { type: "message", role: "user", content: "Message 2" },
    ] satisfies ResponsesInputItem[];
    const items = (await storage.addItems(conv.id, itemInputs))!;
    const item1Id = items[0]!.id;
    const item2Id = items[1]!.id;

    // 1. Retrieve Single Item
    const getRes = await endpoint.handler(
      new Request(`http://localhost/conversations/${conv.id}/items/${item1Id}`),
    );
    expect(getRes.status).toBe(200);
    const itemData = (await parseResponse<ConversationItem>(getRes))!;
    expect(
      itemData.type === "message" && typeof itemData.content === "string" ? itemData.content : "",
    ).toBe("Message 1");

    // 2. List with Limit & Order
    const listRes = await endpoint.handler(
      new Request(`http://localhost/conversations/${conv.id}/items?limit=1&order=desc`),
    );
    const listData = (await parseResponse<ConversationItemList>(listRes))!;
    expect(listData.data).toHaveLength(1);
    expect(listData.data[0]!.id).toBe(item2Id);

    // 3. Delete Single Item (Returns parent conversation)
    const delRes = await endpoint.handler(
      new Request(`http://localhost/conversations/${conv.id}/items/${item1Id}`, {
        method: "DELETE",
      }),
    );
    expect(delRes.status).toBe(200);
    const delData = (await parseResponse<Conversation>(delRes))!;
    expect(delData.id).toBe(conv.id);
    expect(delData.object).toBe("conversation");

    // 4. Verify deletion
    const finalItemsRes = await endpoint.handler(
      new Request(`http://localhost/conversations/${conv.id}/items`),
    );
    const finalItemsData = (await parseResponse<ConversationItemList>(finalItemsRes))!;
    expect(finalItemsData.data).toHaveLength(1);
    expect(finalItemsData.data[0]!.id).toBe(item2Id);
  });

  test("should handle pagination (has_more)", async () => {
    const endpoint = conversations(config);
    const storage = config.storage!;

    const itemInputs = Array.from({ length: 5 }, (_, i) => ({
      type: "message",
      role: "user",
      content: `Msg ${i + 1}`,
    })) satisfies ResponsesInputItem[];

    const conv = await storage.createConversation({ items: itemInputs });

    const res = await endpoint.handler(
      new Request(`http://localhost/conversations/${conv.id}/items?limit=3&order=asc`),
    );
    const data = (await parseResponse<ConversationItemList>(res))!;
    expect(data.data).toHaveLength(3);
    expect(data.has_more).toBe(true);
    const firstItem = data.data[0];
    if (firstItem && firstItem.type === "message") {
      expect(typeof firstItem.content === "string" ? firstItem.content : "").toBe("Msg 1");
    } else {
      throw new Error("Expected message item");
    }

    const res2 = await endpoint.handler(
      new Request(`http://localhost/conversations/${conv.id}/items?limit=5&order=asc`),
    );
    const data2 = (await parseResponse<ConversationItemList>(res2))!;
    expect(data2.data).toHaveLength(5);
    expect(data2.has_more).toBe(false);

    const res3 = await endpoint.handler(
      new Request(`http://localhost/conversations/${conv.id}/items?limit=10&order=asc`),
    );
    const data3 = (await parseResponse<ConversationItemList>(res3))!;
    expect(data3.data).toHaveLength(5);
    expect(data3.has_more).toBe(false);
  });

  test("should handle pagination with after and order=desc", async () => {
    const endpoint = conversations(config);
    const storage = config.storage!;

    const itemInputs = Array.from({ length: 5 }, (_, i) => ({
      type: "message",
      role: "user",
      content: `Msg ${i + 1}`,
    })) satisfies ResponsesInputItem[];

    const conv = await storage.createConversation({ items: itemInputs });

    // 1. Get first page (descending)
    const res1 = await endpoint.handler(
      new Request(`http://localhost/conversations/${conv.id}/items?limit=2&order=desc`),
    );
    const data1 = (await parseResponse<ConversationItemList>(res1))!;
    expect(data1.data).toHaveLength(2);
    const item0 = data1.data[0];
    const item1 = data1.data[1];
    if (item0 && item0.type === "message") {
      expect(typeof item0.content === "string" ? item0.content : "").toBe("Msg 5");
    }
    if (item1 && item1.type === "message") {
      expect(typeof item1.content === "string" ? item1.content : "").toBe("Msg 4");
    }
    expect(data1.has_more).toBe(true);

    const after = data1.data[1]!.id; // Last item of first page

    // 2. Get second page using 'after'
    const res2 = await endpoint.handler(
      new Request(
        `http://localhost/conversations/${conv.id}/items?limit=2&order=desc&after=${after}`,
      ),
    );
    const data2 = (await parseResponse<ConversationItemList>(res2))!;
    expect(data2.data).toHaveLength(2);
    const item20 = data2.data[0];
    const item21 = data2.data[1];
    if (item20 && item20.type === "message") {
      expect(typeof item20.content === "string" ? item20.content : "").toBe("Msg 3");
    }
    if (item21 && item21.type === "message") {
      expect(typeof item21.content === "string" ? item21.content : "").toBe("Msg 2");
    }
    expect(data2.has_more).toBe(true);

    const after2 = data2.data[1]!.id;

    // 3. Get last page
    const res3 = await endpoint.handler(
      new Request(
        `http://localhost/conversations/${conv.id}/items?limit=2&order=desc&after=${after2}`,
      ),
    );
    const data3 = (await parseResponse<ConversationItemList>(res3))!;
    expect(data3.data).toHaveLength(1);
    const item30 = data3.data[0];
    if (item30 && item30.type === "message") {
      expect(typeof item30.content === "string" ? item30.content : "").toBe("Msg 1");
    }
    expect(data3.has_more).toBe(false);
  });

  test("should enforce limit constraints", async () => {
    const endpoint = conversations(config);
    const storage = config.storage!;

    const conv = await storage.createConversation({});

    // Limit too high
    const resHigh = await endpoint.handler(
      new Request(`http://localhost/conversations/${conv.id}/items?limit=1001`),
    );
    expect(resHigh.status).toBe(400);

    // Limit not a number
    const resNan = await endpoint.handler(
      new Request(`http://localhost/conversations/${conv.id}/items?limit=abc`),
    );
    expect(resNan.status).toBe(400);

    // Limit 0 should be allowed and return everything
    const resZero = await endpoint.handler(
      new Request(`http://localhost/conversations/${conv.id}/items?limit=0`),
    );
    expect(resZero.status).toBe(200);
    const dataZero = (await parseResponse<ConversationItemList>(resZero))!;
    expect(dataZero.has_more).toBe(false);
  });

  test("should handle mounted subpaths", async () => {
    const endpoint = conversations(config);

    // Simulate a request mounted under /api/v1/conversations
    const createReq = postJson("http://localhost/api/v1/conversations", {
      metadata: { subpath: "true" },
    });
    const createRes = await endpoint.handler(createReq);
    expect(createRes.status).toBe(200);
    const conv = (await parseResponse<Conversation>(createRes))!;
    expect(conv.metadata!["subpath"]).toBe("true");

    const retrieveRes = await endpoint.handler(
      new Request(`http://localhost/api/v1/conversations/${conv.id}`),
    );
    expect(retrieveRes.status).toBe(200);
    const retrieved = (await parseResponse<Conversation>(retrieveRes))!;
    expect(retrieved.id).toBe(conv.id);
  });

  test("should maintain IDs from input", async () => {
    const endpoint = conversations(config);

    // 1. Maintain item ID during addItems
    const storage = config.storage!;
    const conv = await storage.createConversation({});

    const customItemId = "item_custom_123";
    const addItemsReq = postJson(`http://localhost/conversations/${conv.id}/items`, {
      items: [{ id: customItemId, type: "message", role: "user", content: "Hello" }],
    });
    const addItemsRes = await endpoint.handler(addItemsReq);
    expect(addItemsRes.status).toBe(200);
    const addItemsData = (await parseResponse<ConversationItemList>(addItemsRes))!;
    expect(addItemsData.data[0]!.id).toBe(customItemId);
    expect(addItemsData.first_id).toBe(customItemId);
    expect(addItemsData.last_id).toBe(customItemId);

    // Test with multiple items
    const multiAddItemsReq = postJson(`http://localhost/conversations/${conv.id}/items`, {
      items: [
        { id: "item1", type: "message", role: "user", content: "One" },
        { id: "item2", type: "message", role: "user", content: "Two" },
      ],
    });
    const multiAddItemsRes = await endpoint.handler(multiAddItemsReq);
    const multiAddItemsData = (await parseResponse<ConversationItemList>(multiAddItemsRes))!;
    expect(multiAddItemsData.first_id).toBe("item1");
    expect(multiAddItemsData.last_id).toBe("item2");

    // 2. Maintain item IDs during conversation create
    const createReq = postJson("http://localhost/conversations", {
      items: [{ id: "msg_1", type: "message", role: "user", content: "First" }],
    });
    const createRes = await endpoint.handler(createReq);
    expect(createRes.status).toBe(200);
    const newConv = (await parseResponse<Conversation>(createRes))!;

    const listRes = await endpoint.handler(
      new Request(`http://localhost/conversations/${newConv.id}/items`),
    );
    const listData = (await parseResponse<ConversationItemList>(listRes))!;
    expect(listData.data[0]!.id).toBe("msg_1");
  });

  test("should support input_audio content parts", async () => {
    const endpoint = conversations(config);

    // 1. Create conversation with audio item
    const audioItem = {
      type: "message",
      role: "user",
      content: [
        {
          type: "input_audio",
          input_audio: {
            data: "aGVsbG8=",
            format: "wav",
          },
        },
      ],
    } satisfies ResponsesInputItem;

    const createRes = await endpoint.handler(
      postJson("http://localhost/conversations", {
        items: [audioItem],
      }),
    );
    expect(createRes.status).toBe(200);
    const conv = (await parseResponse<Conversation>(createRes))!;

    // 2. Retrieve items and verify audio content
    const itemsRes = await endpoint.handler(
      new Request(`http://localhost/conversations/${conv.id}/items`),
    );
    const items = (await parseResponse<ConversationItemList>(itemsRes))!;
    expect(items.data).toHaveLength(1);

    const item = items.data[0]!;
    expect(item.type).toBe("message");
    if (item.type === "message" && Array.isArray(item.content)) {
      const part = item.content[0]!;
      expect(part.type).toBe("input_audio");
      if (part.type === "input_audio") {
        expect(part.input_audio.data).toBe("aGVsbG8=");
        expect(part.input_audio.format).toBe("wav");
      }
    } else {
      throw new Error("Expected message item with content array");
    }
  });

  test("should reject empty input_image and input_file payloads", async () => {
    const endpoint = conversations(config);

    // 1. Create conversation with empty input_image
    const reqImage = postJson("http://localhost/conversations", {
      items: [
        {
          type: "message",
          role: "user",
          content: [{ type: "input_image" }],
        },
      ],
    });
    const resImage = await endpoint.handler(reqImage);
    expect(resImage.status).toBe(400);

    // 2. Create conversation with empty input_file
    const reqFile = postJson("http://localhost/conversations", {
      items: [
        {
          type: "message",
          role: "user",
          content: [{ type: "input_file" }],
        },
      ],
    });
    const resFile = await endpoint.handler(reqFile);
    expect(resFile.status).toBe(400);

    // 3. Add item with empty input_image
    const storage = config.storage!;
    const conv = await storage.createConversation({});

    const reqAdd = postJson(`http://localhost/conversations/${conv.id}/items`, {
      items: [
        {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_image",
              image_url: null,
              file_id: null,
            },
          ],
        },
      ],
    });
    const resAdd = await endpoint.handler(reqAdd);
    expect(resAdd.status).toBe(400);
  });

  test("should return 404 when conversation not found for items operations", async () => {
    const endpoint = conversations(config);
    const nonExistentId = "conv_nonexistent";

    // 1. List items
    const listRes = await endpoint.handler(
      new Request(`http://localhost/conversations/${nonExistentId}/items`),
    );
    expect(listRes.status).toBe(404);
    const listData = (await parseResponse<{ error: { message: string } }>(listRes))!;
    expect(listData.error.message).toBe("Conversation not found");

    // 2. Add items
    const addReq = postJson(`http://localhost/conversations/${nonExistentId}/items`, {
      items: [{ type: "message", role: "user", content: "Hello" }],
    });
    const addRes = await endpoint.handler(addReq);
    expect(addRes.status).toBe(404);
    const addData = (await parseResponse<{ error: { message: string } }>(addRes))!;
    expect(addData.error.message).toBe("Conversation not found");
  });
});

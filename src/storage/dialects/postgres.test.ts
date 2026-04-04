import { describe, expect, test, spyOn } from "bun:test";
import { PostgresDialect } from "./postgres";
import { SqlStorage } from "../sql";
import {
  ConversationRepository,
  CONVERSATION_SCHEMA,
} from "../../endpoints/conversations/repository";

describe("Postgres Dialect (Mocked)", () => {
  const setup = () => {
    const queries: { sql: string; params: any[] } = [];
    const pool = {
      connect: async () => ({
        query: async (arg: any) => {
          const sql = typeof arg === "string" ? arg : arg.text;
          const params = typeof arg === "string" ? [] : arg.values;
          queries.push({ sql, params });
          return { rows: [] };
        },
        release: () => {},
      }),
      query: async (arg: any) => {
        const sql = typeof arg === "string" ? arg : arg.text;
        const params = typeof arg === "string" ? [] : arg.values;
        queries.push({ sql, params });
        if (sql.includes("SELECT")) {
          return { rows: [{ id: "conv-1", created_at: Date.now() }] };
        }
        return { rows: [] };
      },
    };

    // @ts-expect-error - mock pool
    const dialect = new PostgresDialect({ client: pool });
    const storage = new SqlStorage({ dialect });
    return { storage, queries, pool };
  };

  test("should generate correct SQL for conversation lifecycle", async () => {
    const { storage, queries } = setup();
    const repo = new ConversationRepository(storage);
    const metadata = { user_id: "123" };

    // 1. Create
    await repo.createConversation({ metadata });

    const insertConv = queries.find((q) => q.sql?.includes('INSERT INTO "conversations"'));
    expect(insertConv).toBeDefined();
    expect(insertConv!.sql).toContain(
      'INSERT INTO "conversations" ("id", "metadata", "created_at")',
    );
    expect(insertConv!.params).toHaveLength(3);

    // 2. Add Items
    await repo.addItems("conv-1", [
      { id: "item-1", type: "message", role: "user", content: "hello" },
    ]);

    const insertItem = queries.find((q) => q.sql?.includes('INSERT INTO "conversation_items"'));
    expect(insertItem).toBeDefined();
    expect(insertItem!.sql).toContain(
      'INSERT INTO "conversation_items" ("id", "conversation_id", "type", "data", "created_at", "role", "content")',
    );
  });

  test("should generate correct Postgres UPSERT syntax", async () => {
    const { storage, queries } = setup();
    const repo = new ConversationRepository(storage);

    await repo.updateConversation("conv-1", { metadata: { updated: "true" } });

    const upsertQuery = queries.find((q) => q.sql?.includes("INSERT INTO"));
    expect(upsertQuery).toBeDefined();
    expect(upsertQuery!.sql).toContain('ON CONFLICT ("id") DO UPDATE SET');
  });

  test("should generate correct JSON extraction for Postgres", async () => {
    const { storage, queries } = setup();
    const repo = new ConversationRepository(storage);

    await repo.listConversations({
      where: { "metadata.user_id": "123" } as any,
    });

    const listQuery = queries.find((q) => q.sql?.includes("SELECT * FROM"));
    expect(listQuery).toBeDefined();
    // Accept either $1 or $2 depending on internal query builder state
    expect(listQuery!.sql).toMatch(/"metadata"->>'user_id' = \$[12]/);
  });
});

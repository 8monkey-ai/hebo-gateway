import { describe, expect, test, mock } from "bun:test";
import { MysqlDialect, type Mysql2Pool } from "./mysql";
import { SqlStorage } from "../sql";
import { conversationExtension } from "../../endpoints/conversations/extension";
import type { WhereCondition } from "../types";

describe("MySQL Dialect (Mocked)", () => {
  const setup = () => {
    const queries: { sql: string; params: unknown[] }[] = [];

    const connection = {
      execute: (sql: string, params: unknown[]) => {
        queries.push({ sql, params });
        if (sql.includes("SELECT")) {
          return Promise.resolve([[{ id: "conv-1", created_at: new Date(), metadata: "{}" }], []]);
        }
        return Promise.resolve([[]]);
      },
      beginTransaction: () => Promise.resolve(),
      commit: () => Promise.resolve(),
      rollback: () => Promise.resolve(),
      release: () => {},
    };

    const pool = {
      getConnection: () => Promise.resolve(connection),
      execute: mock((sql: string, params: unknown[]) => {
        queries.push({ sql, params });
        if (sql.includes("SELECT")) {
          return Promise.resolve([[{ id: "conv-1", created_at: new Date(), metadata: "{}" }], []]);
        }
        return Promise.resolve([[]]);
      }),
    };

    const dialect = new MysqlDialect({ client: pool as unknown as Mysql2Pool });
    const storage = new SqlStorage({ dialect }).$extends(conversationExtension);
    return { storage, queries, pool };
  };

  test("should generate correct SQL for conversation lifecycle", async () => {
    const { storage, queries } = setup();
    await storage.migrate();
    const metadata = { user_id: "123" };

    // 1. Create
    await storage.conversations.create({ metadata });

    const insertConv = queries.find((q) => q.sql.includes("INSERT INTO `conversations`"));
    expect(insertConv).toBeDefined();
    // Order may vary
    expect(insertConv!.sql).toContain("`id`");
    expect(insertConv!.sql).toContain("`metadata`");
    expect(insertConv!.sql).toContain("`created_at`");
    expect(insertConv!.params).toHaveLength(3);

    // 2. Add Items
    await storage.conversation_items.create({
      id: "item-1",
      type: "message",
      role: "user",
      content: "hello",
      conversation_id: "conv-1",
    });

    const insertItem = queries.find((q) => q.sql.includes("INSERT INTO `conversation_items`"));
    expect(insertItem).toBeDefined();
    expect(insertItem!.sql).toContain("`id`");
    expect(insertItem!.sql).toContain("`conversation_id`");
    expect(insertItem!.sql).toContain("`type`");
    expect(insertItem!.sql).toContain("`data`");
  });

  test("should generate correct MySQL UPSERT syntax", async () => {
    const { storage, queries } = setup();
    await storage.migrate();

    await storage.conversations.update("conv-1", { metadata: { updated: "true" } });

    const upsertQuery = queries.find((q) => q.sql.includes("ON DUPLICATE KEY UPDATE"));
    expect(upsertQuery).toBeDefined();
    expect(upsertQuery!.sql).toContain("INSERT INTO `conversations`");
    expect(upsertQuery!.sql).toContain("ON DUPLICATE KEY UPDATE");
  });

  test("should generate correct JSON extraction for MySQL", async () => {
    const { storage, queries } = setup();
    await storage.migrate();

    await storage.conversations.findMany({
      where: { "metadata.user_id": "123" } as WhereCondition<unknown>,
    });

    const listQuery = queries.find((q) => q.sql.includes("SELECT * FROM"));
    expect(listQuery).toBeDefined();
    expect(listQuery!.sql).toContain("JSON_EXTRACT(`metadata`, '$.user_id') = ?");
  });
});

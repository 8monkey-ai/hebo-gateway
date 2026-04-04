import { describe, expect, test, mock } from "bun:test";
import { MysqlDialect } from "./mysql";
import { SqlStorage } from "../sql";
import {
  ConversationRepository,
  CONVERSATION_SCHEMA,
} from "../../endpoints/conversations/repository";

describe("MySQL Dialect (Mocked)", () => {
  const setup = () => {
    const queries: { sql: string; params: any[] } = [];

    const connection = {
      execute: async (sql: string, params: any[]) => {
        queries.push({ sql, params });
        return [[]];
      },
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release: () => {},
    };

    const pool = {
      getConnection: async () => connection,
      execute: mock(async (sql: string, params: any[]) => {
        queries.push({ sql, params });
        if (sql.includes("SELECT")) {
          return [[{ id: "conv-1", created_at: new Date() }], []];
        }
        return [[]];
      }),
    };

    // @ts-expect-error - mock pool
    const dialect = new MysqlDialect({ client: pool });
    const storage = new SqlStorage({ dialect });
    return { storage, queries, pool };
  };

  test("should generate correct SQL for conversation lifecycle", async () => {
    const { storage, queries } = setup();
    const repo = new ConversationRepository(storage);
    const metadata = { user_id: "123" };

    // 1. Create
    await repo.createConversation({ metadata });

    const insertConv = queries.find((q) => q.sql.includes("INSERT INTO `conversations`"));
    expect(insertConv).toBeDefined();
    expect(insertConv!.sql).toContain(
      "INSERT INTO `conversations` (`id`, `metadata`, `created_at`) VALUES (?, ?, ?)",
    );
    expect(insertConv!.params).toHaveLength(3);

    // 2. Add Items
    await repo.addItems("conv-1", [
      { id: "item-1", type: "message", role: "user", content: "hello" },
    ]);

    const insertItem = queries.find((q) => q.sql.includes("INSERT INTO `conversation_items`"));
    expect(insertItem).toBeDefined();
    expect(insertItem!.sql).toContain(
      "INSERT INTO `conversation_items` (`id`, `conversation_id`, `type`, `data`, `created_at`, `role`, `content`) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
  });

  test("should generate correct MySQL UPSERT syntax", async () => {
    const { storage, queries } = setup();
    const repo = new ConversationRepository(storage);

    await repo.updateConversation("conv-1", { metadata: { updated: "true" } });

    const upsertQuery = queries.find((q) => q.sql.includes("ON DUPLICATE KEY UPDATE"));
    expect(upsertQuery).toBeDefined();
    expect(upsertQuery!.sql).toContain("INSERT INTO `conversations`");
    expect(upsertQuery!.sql).toContain("ON DUPLICATE KEY UPDATE");
  });

  test("should generate correct JSON extraction for MySQL", async () => {
    const { storage, queries } = setup();
    const repo = new ConversationRepository(storage);

    await repo.listConversations({
      where: { "metadata.user_id": "123" } as any,
    });

    const listQuery = queries.find((q) => q.sql.includes("SELECT * FROM"));
    expect(listQuery).toBeDefined();
    expect(listQuery!.sql).toContain("JSON_EXTRACT(`metadata`, '$.user_id') = ?");
  });
});

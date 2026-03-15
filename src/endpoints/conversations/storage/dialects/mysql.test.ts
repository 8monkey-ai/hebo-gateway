import { describe, expect, test, mock } from "bun:test";
import { MysqlDialect, MySQLDialectConfig, type Mysql2Pool } from "./mysql";
import { SqlStorage } from "../sql";

describe("MySQL Dialect (Mocked)", () => {
  const createMockPool = () => {
    const queries: { sql: string; params: unknown[] }[] = [];
    
    const execute = mock((sql: string, params?: unknown[]) => {
      queries.push({ sql, params: params ?? [] });
      // Return a mock result: [rows, fields]
      // For SELECT, we return a fake conversation if it looks like an existence check.
      if (sql.trim().toUpperCase().startsWith("SELECT")) {
        if (sql.includes("FROM `conversations`")) {
          return Promise.resolve([[{ id: "conv-1", created_at: new Date() }], []]);
        }
        return Promise.resolve([[], []]);
      }
      return Promise.resolve([{ affectedRows: 1 }, []]);
    });

    const pool = {
      execute,
      getConnection: mock(() => Promise.resolve({
        execute,
        beginTransaction: mock(() => Promise.resolve()),
        commit: mock(() => Promise.resolve()),
        rollback: mock(() => Promise.resolve()),
        release: mock(() => {}),
      })),
    };

    return { pool, queries };
  };

  test("should generate correct SQL for conversation lifecycle", async () => {
    const { pool, queries } = createMockPool();
    const dialect = new MysqlDialect({ client: pool as unknown as Mysql2Pool });
    const storage = new SqlStorage({ dialect });

    // 1. Create Conversation
    const metadata = { foo: "bar" };
    await storage.createConversation({ metadata });

    const insertConv = queries.find(q => q.sql.includes("INSERT INTO `conversations`"));
    expect(insertConv).toBeDefined();
    // Verify MySQL specific: backticks and ? placeholders
    expect(insertConv!.sql).toContain("INSERT INTO `conversations` (`id`, `metadata`, `created_at`) VALUES (?, ?, ?)");
    // Verify JSON mapping
    expect(insertConv!.params[1]).toBe(JSON.stringify(metadata));
    // Verify Date mapping (should be number/timestamp for BIGINT)
    expect(typeof insertConv!.params[2]).toBe("number");

    queries.length = 0; // Reset

    // 2. Add Items (Testing Batch/Transaction)
    await storage.addItems("conv-1", [
      { id: "item-1", type: "message", role: "user", content: "hello" }
    ]);

    const insertItem = queries.find(q => q.sql.includes("INSERT INTO `conversation_items`"));
    expect(insertItem).toBeDefined();
    expect(insertItem!.sql).toContain("INSERT INTO `conversation_items` (`id`, `conversation_id`, `type`, `data`, `created_at`) VALUES (?, ?, ?, ?, ?)");
    expect(pool.getConnection).toHaveBeenCalled();
  });

  test("should generate correct MySQL UPSERT syntax", async () => {
    const { pool, queries } = createMockPool();
    const dialect = new MysqlDialect({ client: pool as unknown as Mysql2Pool });
    const storage = new SqlStorage({ dialect });

    // Mock the initial GET check in updateConversation
    pool.execute.mockResolvedValueOnce([[{ id: "conv-1", created_at: new Date() }], []]);

    await storage.updateConversation("conv-1", { updated: "true" });

    const upsertQuery = queries.find(q => q.sql.includes("ON DUPLICATE KEY UPDATE"));
    expect(upsertQuery).toBeDefined();
    // MySQL specific UPSERT syntax
    expect(upsertQuery!.sql).toContain("ON DUPLICATE KEY UPDATE `metadata` = VALUES(`metadata`)");
  });

  test("should generate correct JSON extraction for MySQL", () => {
    const expression = MySQLDialectConfig.jsonExtract("`metadata`" , "user_id");
    // MySQL specific JSON extraction
    expect(expression).toBe("JSON_EXTRACT(`metadata`, '$.user_id')");
  });
});

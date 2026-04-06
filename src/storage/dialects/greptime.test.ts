import { describe, expect, test, mock } from "bun:test";
import { GrepTimeDialect, GrepTimeDialectConfig } from "./greptime";
import { type PgPool } from "./postgres";
import { SqlStorage } from "../sql";
import { conversationExtension } from "../../endpoints/conversations/extension";

describe("Greptime Dialect (Mocked)", () => {
  const createMockPool = () => {
    const queries: { sql: string; params: unknown[] }[] = [];

    const query = mock((queryInput: string | { text: string; values?: unknown[] }) => {
      const text = typeof queryInput === "string" ? queryInput : queryInput.text;
      const values = typeof queryInput === "string" ? [] : (queryInput.values ?? []);

      queries.push({ sql: text, params: values });
      // Return a mock result
      if (text.trim().toUpperCase().startsWith("SELECT")) {
        if (text.includes('FROM "conversations"')) {
          return Promise.resolve({
            rows: [{ id: "conv-1", created_at: Date.now(), metadata: "{}" }],
            rowCount: 1,
          });
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      return Promise.resolve({ rows: [], rowCount: 1 });
    });

    const pool = {
      query,
      connect: mock(() =>
        Promise.resolve({
          query,
          release: mock(() => {}),
        }),
      ),
    };

    return { pool, queries };
  };

  test("should generate correct Greptime-specific table creation queries", async () => {
    const { pool, queries } = createMockPool();
    const dialect = new GrepTimeDialect({ client: pool as unknown as PgPool });
    const storage = new SqlStorage({ dialect }).$extends(conversationExtension);

    await storage.migrate();

    const createConversations = queries.find((q) =>
      q.sql.includes('CREATE TABLE IF NOT EXISTS "conversations"'),
    );
    expect(createConversations).toBeDefined();
    // Verify Greptime specific: TIME INDEX and PARTITION clause
    expect(createConversations!.sql).toContain('TIME INDEX ("created_at")');
    expect(createConversations!.sql).toContain('PARTITION ON COLUMNS ("id")');

    const createItems = queries.find((q) =>
      q.sql.includes('CREATE TABLE IF NOT EXISTS "conversation_items"'),
    );
    expect(createItems).toBeDefined();
    // Verify Greptime specific: SKIPPING INDEX
    expect(createItems!.sql).toContain('"id" VARCHAR(255) SKIPPING INDEX');
  });

  test("should map parameters correctly for Greptime (PgPool driver)", async () => {
    const { pool, queries } = createMockPool();
    const dialect = new GrepTimeDialect({ client: pool as unknown as PgPool });
    const storage = new SqlStorage({ dialect }).$extends(conversationExtension);
    await storage.migrate();

    const metadata = { user: "greptime" };
    await storage.conversations.create({ metadata });

    const insertConv = queries.find((q) => q.sql.includes('INSERT INTO "conversations"'));
    expect(insertConv).toBeDefined();

    // Find the parameter that is a JSON string (or Uint8Array in this case)
    const metadataParam = insertConv!.params.find(
      (p) => p instanceof Uint8Array || (typeof p === "string" && p.startsWith("{")),
    );
    expect(metadataParam).toBeDefined();
    expect(metadataParam instanceof Uint8Array).toBe(true);
    const decodedJson = new TextDecoder().decode(metadataParam as Uint8Array);
    expect(decodedJson).toBe(JSON.stringify(metadata));

    // Date using pg driver should be a specific string format
    expect(typeof insertConv!.params[2]).toBe("string");
    expect(insertConv!.params[2] as string).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}/);
  });

  test("should generate correct Greptime JSON extraction and SELECT casts", () => {
    // Check JSON Select Cast (to prevent rust-style unicode bugs)
    const selectCast = GrepTimeDialectConfig.selectJson('c."metadata"');
    expect(selectCast).toBe('c."metadata"::STRING');

    // Check JSON extraction (uses custom json_get_string function)
    const extract = GrepTimeDialectConfig.jsonExtract('c."metadata"', "user_id");
    expect(extract).toBe(`json_get_string(c."metadata", 'user_id')`);
  });
});

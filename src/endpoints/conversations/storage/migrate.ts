import type { DialectConfig, QueryExecutor } from "./dialects/types";
import type { TableSchema } from "./types";

export async function runMigration(
  executor: QueryExecutor,
  config: DialectConfig,
  additionalFields: TableSchema,
) {
  const { types, quote: q, supportCreateIndexIfNotExists } = config;
  const isTimeIndex = types.index === "TIME";

  const varchar = (len: number) => (types.varchar === "TEXT" ? "TEXT" : `${types.varchar}(${len})`);
  const timeIndex = isTimeIndex ? `, TIME INDEX (${q("created_at")})` : "";
  const withClause = isTimeIndex ? ` WITH ('merge_mode'='last_non_null')` : "";
  const partition = (cols: string[]) =>
    config.partitionClause ? ` ${config.partitionClause(cols.map((col) => q(col)))}` : "";

  const getTableColumns = (resource: keyof TableSchema) => {
    const fields = additionalFields[resource] ?? {};
    return Object.entries(fields)
      .map(([name, schema]) => {
        let col = `${q(name)} ${schema.type}`;
        if (schema.default) col += ` DEFAULT ${schema.default}`;
        if (schema.nullable === false) col += " NOT NULL";
        return col;
      })
      .join(", ");
  };

  const getPartitionCols = (resource: keyof TableSchema, baseCols: string[]) => {
    const fields = additionalFields[resource] ?? {};
    const extra = Object.entries(fields)
      .filter(([, s]) => s.partition)
      .map(([n]) => n);
    return [...baseCols, ...extra];
  };

  const createIndex = async (table: string, name: string, cols: string[], seq = false) => {
    const isBrin = types.index === "BRIN";
    const using = seq && types.index !== "B-TREE" ? `USING ${types.index}` : "";
    const ifNotExists = supportCreateIndexIfNotExists ? "IF NOT EXISTS" : "";

    const formattedCols = cols
      .map((c) => {
        const parts = c.split(" ");
        const col = parts[0]!;
        const dir = parts[1];
        // BRIN doesn't support ASC/DESC
        const effectiveDir = isBrin ? "" : dir;
        return effectiveDir ? `${q(col)} ${effectiveDir}` : q(col);
      })
      .join(", ");

    try {
      await executor.run(
        `CREATE INDEX ${ifNotExists} ${q(name)} ON ${q(table)} ${using} (${formattedCols})`,
        [],
      );
    } catch (err: unknown) {
      if (
        !supportCreateIndexIfNotExists &&
        err instanceof Error &&
        err.message?.includes("Duplicate key name")
      ) {
        return;
      }
      throw err;
    }
  };

  const extraConvCols = getTableColumns("conversations");
  const convCols = extraConvCols ? `, ${extraConvCols}` : "";

  await executor.run(
    `
    CREATE TABLE IF NOT EXISTS ${q("conversations")} (
      ${q("id")} ${varchar(255)},
      ${q("created_at")} ${types.timestamp},
      ${q("metadata")} ${types.json}
      ${convCols},
      PRIMARY KEY (${q("id")})
      ${timeIndex}
    )${partition(getPartitionCols("conversations", ["id"]))}${withClause}
  `,
    [],
  );

  const extraItemCols = getTableColumns("conversation_items");
  const itemCols = extraItemCols ? `, ${extraItemCols}` : "";

  await executor.run(
    `
    CREATE TABLE IF NOT EXISTS ${q("conversation_items")} (
      ${q("id")} ${varchar(255)}${isTimeIndex ? " SKIPPING INDEX" : ""},
      ${q("conversation_id")} ${varchar(255)},
      ${q("created_at")} ${types.timestamp},
      ${q("type")} ${varchar(64)},
      ${q("data")} ${types.json}
      ${itemCols},
      PRIMARY KEY (${q("conversation_id")}${isTimeIndex ? "" : `, ${q("id")}`})
      ${timeIndex}
    )${partition(getPartitionCols("conversation_items", ["conversation_id"]))}${withClause}
  `,
    [],
  );

  // ALTER TABLE for additionalFields (primitive schema migration)
  const migrateTable = async (table: string, resource: keyof TableSchema) => {
    const fields = additionalFields[resource] ?? {};
    if (Object.keys(fields).length === 0) return;

    for (const [name, schema] of Object.entries(fields)) {
      try {
        let col = `${q(name)} ${schema.type}`;
        if (schema.default) col += ` DEFAULT ${schema.default}`;
        if (schema.nullable === false) col += " NOT NULL";
        await executor.run(`ALTER TABLE ${q(table)} ADD COLUMN ${col}`, []);
      } catch {
        // Ignore errors (e.g. column already exists)
      }
    }
  };

  await migrateTable("conversations", "conversations");
  await migrateTable("conversation_items", "conversation_items");

  if (!isTimeIndex) {
    await createIndex(
      "conversations",
      "idx_conversations_created_at",
      ["created_at DESC", "id DESC"],
      true,
    );
    await createIndex("conversation_items", "idx_items_conv_id", [
      "conversation_id",
      "created_at DESC",
      "id DESC",
    ]);

    const createSchemaIndexes = async (table: string, resource: keyof TableSchema) => {
      const fields = additionalFields[resource] ?? {};
      for (const [name, schema] of Object.entries(fields)) {
        if (schema.index) {
          const indexName = `idx_${table}_${name}`;
          await createIndex(table, indexName, [name]);
        }
      }
    };
    await createSchemaIndexes("conversations", "conversations");
    await createSchemaIndexes("conversation_items", "conversation_items");
  }
}

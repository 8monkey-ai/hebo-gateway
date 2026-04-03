import type { DialectConfig } from "./dialects/types";
import type { ConversationQueryOptions, ColumnSchema, WhereClause } from "./types";

export abstract class BaseQueryBuilder {
  constructor(
    protected readonly config: DialectConfig,
    protected readonly schemaFields: Record<string, ColumnSchema>,
    protected readonly baseCols: string[],
    protected readonly jsonCol: "metadata" | "data",
  ) {}

  protected appendWhereClause(
    sqlParts: string[],
    queryArgs: unknown[],
    where: WhereClause<any>,
    getNextIdx: () => number,
  ) {
    const { placeholder: p, quote: q } = this.config;

    const applyFilter = (column: string, val: unknown) => {
      if (val !== null && typeof val === "object" && !Array.isArray(val)) {
        const operator = val as Record<string, unknown>;
        let applied = false;
        if ("eq" in operator) {
          sqlParts.push(`AND ${column} = ${p(getNextIdx())}`);
          queryArgs.push(operator["eq"]);
          applied = true;
        }
        if ("ne" in operator) {
          sqlParts.push(`AND ${column} != ${p(getNextIdx())}`);
          queryArgs.push(operator["ne"]);
          applied = true;
        }
        if ("gt" in operator) {
          sqlParts.push(`AND ${column} > ${p(getNextIdx())}`);
          queryArgs.push(operator["gt"]);
          applied = true;
        }
        if ("gte" in operator) {
          sqlParts.push(`AND ${column} >= ${p(getNextIdx())}`);
          queryArgs.push(operator["gte"]);
          applied = true;
        }
        if ("lt" in operator) {
          sqlParts.push(`AND ${column} < ${p(getNextIdx())}`);
          queryArgs.push(operator["lt"]);
          applied = true;
        }
        if ("lte" in operator) {
          sqlParts.push(`AND ${column} <= ${p(getNextIdx())}`);
          queryArgs.push(operator["lte"]);
          applied = true;
        }
        if ("in" in operator && Array.isArray(operator["in"])) {
          const itemsList = operator["in"];
          if (itemsList.length > 0) {
            const ps = itemsList.map(() => p(getNextIdx())).join(", ");
            sqlParts.push(`AND ${column} IN (${ps})`);
            queryArgs.push(...itemsList);
          } else {
            sqlParts.push("AND 1=0");
          }
          applied = true;
        }
        if ("contains" in operator && typeof operator["contains"] === "string") {
          sqlParts.push(`AND ${column} LIKE ${p(getNextIdx())}`);
          queryArgs.push(`%${operator["contains"]}%`);
          applied = true;
        }
        if ("isNull" in operator) {
          sqlParts.push(`AND ${column} IS ${operator["isNull"] ? "" : "NOT "}NULL`);
          applied = true;
        }

        if (!applied) {
          for (const [subKey, subVal] of Object.entries(val)) {
            const subColumn = this.config.jsonExtract(`c.${q(column.split(".")[1]!)}`, subKey);
            applyFilter(subColumn, subVal);
          }
        }
      } else {
        sqlParts.push(`AND ${column} = ${p(getNextIdx())}`);
        queryArgs.push(val);
      }
    };

    for (const [key, val] of Object.entries(where)) {
      if (key === "metadata" || key === "data") {
        if (val && typeof val === "object") {
          for (const [subKey, subVal] of Object.entries(val)) {
            const column = this.config.jsonExtract(`c.${q(key)}`, subKey);
            applyFilter(column, subVal);
          }
        }
        continue;
      }

      const isSchema = key in this.schemaFields || this.baseCols.includes(key);
      const column = isSchema
        ? `c.${q(key)}`
        : this.config.jsonExtract(`c.${q(this.jsonCol)}`, key);

      applyFilter(column, val);
    }
  }
}

export class ConversationQueryBuilder extends BaseQueryBuilder {
  constructor(config: DialectConfig, schemaFields: Record<string, ColumnSchema> = {}) {
    super(config, schemaFields, ["id", "created_at"], "metadata");
  }

  buildListQuery(
    table: string,
    options: ConversationQueryOptions<any>,
  ): { sql: string; args: unknown[] } {
    const { after, order, limit, where } = options;
    const { placeholder: p, quote: q, selectJson: sj, limitAsLiteral } = this.config;

    const isAsc = order === "asc";
    const dir = isAsc ? "ASC" : "DESC";
    const op = isAsc ? ">" : "<";

    const extraCols = Object.keys(this.schemaFields).map((c) => `c.${q(c)}`);
    const cols = [
      `c.${q("id")}`,
      `c.${q("created_at")}`,
      `${sj(`c.${q("metadata")}`)} as ${q("metadata")}`,
      ...extraCols,
    ];

    const sqlParts = [`SELECT ${cols.join(", ")} FROM ${q(table)} c WHERE 1=1`];
    const queryArgs: unknown[] = [];
    let nextIdx = 0;

    if (where) {
      this.appendWhereClause(sqlParts, queryArgs, where, () => nextIdx++);
    }

    if (after) {
      sqlParts.push(
        `AND EXISTS (SELECT 1 FROM ${q(table)} _cursor WHERE _cursor.${q("id")} = ${p(
          nextIdx++,
        )} AND (c.${q("created_at")} ${op} _cursor.${q("created_at")} OR (c.${q(
          "created_at",
        )} = _cursor.${q("created_at")} AND c.${q("id")} ${op} _cursor.${q("id")})))`,
      );
      queryArgs.push(after);
    }

    sqlParts.push(`ORDER BY c.${q("created_at")} ${dir}, c.${q("id")} ${dir}`);

    if (limit !== undefined) {
      const limitVal = Number(limit);
      if (!isNaN(limitVal)) {
        if (limitAsLiteral) {
          sqlParts.push(`LIMIT ${limitVal}`);
        } else {
          sqlParts.push(`LIMIT ${p(nextIdx++)}`);
          queryArgs.push(limitVal);
        }
      }
    }

    return { sql: sqlParts.join(" "), args: queryArgs };
  }
}

export class ConversationItemQueryBuilder extends BaseQueryBuilder {
  constructor(config: DialectConfig, schemaFields: Record<string, ColumnSchema> = {}) {
    super(config, schemaFields, ["id", "conversation_id", "created_at", "type"], "data");
  }

  buildListQuery(
    table: string,
    conversationId: string,
    options: ConversationQueryOptions<any>,
  ): { sql: string; args: unknown[] } {
    const { after, order, limit, where } = options;
    const { placeholder: p, quote: q, selectJson: sj, limitAsLiteral } = this.config;

    const isAsc = order === "asc";
    const dir = isAsc ? "ASC" : "DESC";
    const op = isAsc ? ">" : "<";

    const extraCols = Object.keys(this.schemaFields).map((c) => `c.${q(c)}`);
    const cols = [
      `c.${q("id")}`,
      `c.${q("conversation_id")}`,
      `c.${q("created_at")}`,
      `c.${q("type")}`,
      `${sj(`c.${q("data")}`)} as ${q("data")}`,
      ...extraCols,
    ];

    const sqlParts = [
      `SELECT ${cols.join(", ")} FROM ${q(table)} c WHERE c.${q("conversation_id")} = ${p(0)}`,
    ];
    const queryArgs: unknown[] = [conversationId];
    let nextIdx = 1;

    if (where) {
      this.appendWhereClause(sqlParts, queryArgs, where, () => nextIdx++);
    }

    if (after) {
      sqlParts.push(
        `AND EXISTS (SELECT 1 FROM ${q(table)} _cursor WHERE _cursor.${q("id")} = ${p(
          nextIdx++,
        )} AND _cursor.${q("conversation_id")} = ${p(
          nextIdx++,
        )} AND (c.${q("created_at")} ${op} _cursor.${q("created_at")} OR (c.${q(
          "created_at",
        )} = _cursor.${q("created_at")} AND c.${q("id")} ${op} _cursor.${q("id")})))`,
      );
      queryArgs.push(after, conversationId);
    }

    sqlParts.push(`ORDER BY c.${q("created_at")} ${dir}, c.${q("id")} ${dir}`);

    if (limit !== undefined) {
      const limitVal = Number(limit);
      if (!isNaN(limitVal)) {
        if (limitAsLiteral) {
          sqlParts.push(`LIMIT ${limitVal}`);
        } else {
          sqlParts.push(`LIMIT ${p(nextIdx++)}`);
          queryArgs.push(limitVal);
        }
      }
    }

    return { sql: sqlParts.join(" "), args: queryArgs };
  }
}

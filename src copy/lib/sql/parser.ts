/**
 * SQL Parser and AST Validator
 */

import { Parser, type AST } from "node-sql-parser";

const parser = new Parser();

// -- Errors ----------------------------------------------------------

class SQLValidationError extends Error {
  constructor(
    message: string,
    public context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "SQLValidationError";
  }
}

export class SQLExecutionError extends Error {
  constructor(
    message: string,
    public context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "SQLExecutionError";
  }
}

// -- Parse / Serialize -----------------------------------------------

export function parseSQL(sql: string): AST {
  try {
    const result = parser.astify(sql, { database: "PostgresQL" });
    return Array.isArray(result) ? result[0]! : result;
  } catch (error: any) {
    throw new SQLValidationError(`Invalid SQL syntax: ${error?.message}`, { sql });
  }
}

function astToSQL(ast: AST): string {
  try {
    return parser.sqlify(ast, { database: "PostgresQL" });
  } catch (error: any) {
    throw new SQLExecutionError(`Failed to serialize AST: ${error?.message}`);
  }
}

// -- Validation ------------------------------------------------------

export interface SQLValidationOptions {
  /** Allow SELECT (default: true) */
  allowSelect?: boolean;
  /** Allow UPDATE (default: false) */
  allowUpdate?: boolean;
  /** Allow INSERT (default: false) */
  allowInsert?: boolean;
  /** Allow DELETE (default: false) */
  allowDelete?: boolean;
  /** Require WHERE on UPDATE/DELETE (default: true) */
  requireWhereForMutations?: boolean;
  /** Max tables in FROM (default: 10) */
  maxTables?: number;
  /** Whitelist of allowed tables. If set, only these are queryable. */
  allowedTables?: string[];
  /** Required schema prefix (e.g. "coznt") — rejects queries touching other schemas */
  requiredSchema?: string;
}

type ResolvedOptions = Required<Omit<SQLValidationOptions, "requiredSchema">> & {
  requiredSchema?: string;
};

export function validateSQL(ast: AST | AST[], options: SQLValidationOptions = {}): void {
  const opts: ResolvedOptions = {
    allowSelect: options.allowSelect ?? true,
    allowUpdate: options.allowUpdate ?? false,
    allowInsert: options.allowInsert ?? false,
    allowDelete: options.allowDelete ?? false,
    requireWhereForMutations: options.requireWhereForMutations ?? true,
    maxTables: options.maxTables ?? 10,
    allowedTables: options.allowedTables ?? [],
    requiredSchema: options.requiredSchema,
  };

  const statements = Array.isArray(ast) ? ast : [ast];
  for (const stmt of statements) {
    validateStatement(stmt, opts);
  }
}

function validateStatement(stmt: any, opts: ResolvedOptions): void {
  const type = stmt.type?.toLowerCase();

  switch (type) {
    case "select":
      if (!opts.allowSelect) throw new SQLValidationError("SELECT statements are not allowed");
      validateSelect(stmt, opts);
      break;

    case "update":
      if (!opts.allowUpdate) throw new SQLValidationError("UPDATE statements are not allowed");
      if (opts.requireWhereForMutations && !stmt.where)
        throw new SQLValidationError("UPDATE without WHERE clause is not allowed");
      validateTableAccess(stmt.table, opts);
      break;

    case "insert":
      if (!opts.allowInsert) throw new SQLValidationError("INSERT statements are not allowed");
      validateTableAccess(stmt.table, opts);
      break;

    case "delete":
      if (!opts.allowDelete) throw new SQLValidationError("DELETE statements are not allowed");
      if (opts.requireWhereForMutations && !stmt.where)
        throw new SQLValidationError("DELETE without WHERE clause is not allowed");
      validateTableAccess(stmt.from, opts);
      break;

    case "drop":
    case "truncate":
    case "create":
    case "alter":
      throw new SQLValidationError(`${type.toUpperCase()} statements are not allowed`);

    default:
      throw new SQLValidationError(`Unsupported statement type: ${type}`);
  }
}

function validateSelect(stmt: any, opts: ResolvedOptions): void {
  if (stmt.from) {
    validateTableAccess(stmt.from, opts);
    const tableCount = Array.isArray(stmt.from) ? stmt.from.length : 1;
    if (tableCount > opts.maxTables) {
      throw new SQLValidationError(
        `Too many tables in query (max: ${opts.maxTables}, found: ${tableCount})`,
      );
    }
  }
  if (stmt.where) validateExpression(stmt.where, opts);
  if (stmt.columns && Array.isArray(stmt.columns)) {
    for (const col of stmt.columns) {
      if (col.expr?.type === "select") validateSelect(col.expr, opts);
    }
  }
}

function validateTableAccess(from: any, opts: ResolvedOptions): void {
  if (!from) return;
  const tables = Array.isArray(from) ? from : [from];

  for (const ref of tables) {
    // Subquery
    if (ref.expr?.type === "select") {
      validateSelect(ref.expr, opts);
      continue;
    }

    let tableName: string | null = null;
    let schema: string | undefined;

    if (typeof ref === "string") {
      tableName = ref;
    } else if (ref.table) {
      tableName = ref.table;
      schema = ref.db; // node-sql-parser puts schema in .db
    }

    if (!tableName) continue;

    // Schema check
    if (opts.requiredSchema && schema && schema !== opts.requiredSchema) {
      throw new SQLValidationError(
        `Access to schema '${schema}' is not allowed (only '${opts.requiredSchema}')`,
        { table: tableName, schema },
      );
    }

    // Whitelist check
    if (opts.allowedTables.length > 0) {
      const fullName = schema ? `${schema}.${tableName}` : tableName;
      const isAllowed = opts.allowedTables.some(
        (a) => a.toLowerCase() === fullName.toLowerCase() || a.toLowerCase() === tableName!.toLowerCase(),
      );
      if (!isAllowed) {
        throw new SQLValidationError(`Access to table '${fullName}' is not allowed`, {
          table: fullName,
          allowedTables: opts.allowedTables,
        });
      }
    }
  }
}

function validateExpression(expr: any, opts: ResolvedOptions): void {
  if (!expr) return;
  if (expr.type === "select") validateSelect(expr, opts);
  if (expr.left) validateExpression(expr.left, opts);
  if (expr.right) validateExpression(expr.right, opts);
  if (Array.isArray(expr.value)) {
    for (const v of expr.value) validateExpression(v, opts);
  }
}

// -- Extraction ------------------------------------------------------

export function extractTableNames(ast: AST | AST[]): string[] {
  const tables = new Set<string>();
  const statements = Array.isArray(ast) ? ast : [ast];
  for (const stmt of statements) extractTablesFromStatement(stmt, tables);
  return Array.from(tables);
}

function extractTablesFromStatement(stmt: any, tables: Set<string>, cteNames = new Set<string>()): void {
  if (!stmt) return;

  // CTEs
  if (stmt.with && Array.isArray(stmt.with)) {
    for (const cte of stmt.with) {
      const name = cte.name?.value ?? cte.name;
      if (name) cteNames.add(name);
      if (cte.stmt) extractTablesFromStatement(cte.stmt, tables, cteNames);
    }
  }

  const addTable = (name: string, schema?: string) => {
    if (!name || cteNames.has(name)) return;
    tables.add(schema ? `${schema}.${name}` : name);
  };

  // FROM
  if (stmt.from) {
    for (const ref of Array.isArray(stmt.from) ? stmt.from : [stmt.from]) {
      if (typeof ref === "string") addTable(ref);
      else if (ref.table) addTable(ref.table, ref.db);
      else if (ref.expr?.type === "select") extractTablesFromStatement(ref.expr, tables, cteNames);
    }
  }

  // UPDATE/DELETE/INSERT table
  if (stmt.table) {
    if (typeof stmt.table === "string") addTable(stmt.table);
    else if (Array.isArray(stmt.table)) {
      for (const t of stmt.table) {
        if (typeof t === "string") addTable(t);
        else if (t.table) addTable(t.table, t.db);
      }
    } else if (stmt.table.table) addTable(stmt.table.table, stmt.table.db);
  }

  if (stmt.where) extractTablesFromExpression(stmt.where, tables, cteNames);
  if (stmt.columns && Array.isArray(stmt.columns)) {
    for (const col of stmt.columns) {
      if (col.expr?.type === "select") extractTablesFromStatement(col.expr, tables, cteNames);
    }
  }
}

function extractTablesFromExpression(expr: any, tables: Set<string>, cteNames = new Set<string>()): void {
  if (!expr) return;
  if (expr.type === "select") extractTablesFromStatement(expr, tables, cteNames);
  if (expr.left) extractTablesFromExpression(expr.left, tables, cteNames);
  if (expr.right) extractTablesFromExpression(expr.right, tables, cteNames);
  if (Array.isArray(expr.value)) {
    for (const v of expr.value) extractTablesFromExpression(v, tables, cteNames);
  }
}

// -- Helpers ---------------------------------------------------------

export function getStatementType(ast: AST | AST[]): string {
  const statements = Array.isArray(ast) ? ast : [ast];
  return statements[0]?.type?.toUpperCase() || "UNKNOWN";
}

export function isWriteOperation(statementType: string): boolean {
  return ["INSERT", "UPDATE", "DELETE"].includes(statementType.toUpperCase());
}

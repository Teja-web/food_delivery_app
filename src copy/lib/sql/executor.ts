/**
 * SQL Executor — parse, validate, execute with parameterized queries.
 */

import { Pool } from "pg";
import {
  parseSQL,
  validateSQL,
  extractTableNames,
  getStatementType,
  isWriteOperation,
  type SQLValidationOptions,
  SQLExecutionError,
} from "./parser";

let _pool: Pool | null = null;

function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  }
  return _pool;
}

interface ExecuteOptions {
  /** AST validation overrides */
  validation?: SQLValidationOptions;
  /** Parameterized query values ($1, $2, ...) */
  params?: unknown[];
  /** Validate + return SQL without executing */
  dryRun?: boolean;
  /** Row limit safety cap (default: 500) */
  maxRows?: number;
}

interface ExecuteResult {
  rows: Record<string, unknown>[];
  sql: string;
  tables: string[];
  statementType: string;
  rowCount: number;
}

/**
 * Execute a SQL query with AST validation and parameterized values.
 */
export async function executeSQLQuery(
  sqlQuery: string,
  options: ExecuteOptions = {},
): Promise<ExecuteResult> {
  const ast = parseSQL(sqlQuery);
  const tables = extractTableNames(ast);
  const statementType = getStatementType(ast);

  // Validate
  validateSQL(ast, {
    requireWhereForMutations: true,
    maxTables: 10,
    ...options.validation,
  });

  // Parameter count check
  const params = options.params ?? [];
  if (params.length > 0) {
    const placeholderCount = (sqlQuery.match(/\$\d+/g) || []).length;
    if (placeholderCount !== params.length) {
      throw new SQLExecutionError(
        `Parameter count mismatch: SQL has ${placeholderCount} placeholders but ${params.length} params provided`,
        { sql: sqlQuery.slice(0, 200), placeholders: placeholderCount, params: params.length },
      );
    }
  }

  if (options.dryRun) {
    return { rows: [], sql: sqlQuery, tables, statementType, rowCount: 0 };
  }

  // Execute
  const pool = getPool();
  const result = await pool.query(sqlQuery, params.length > 0 ? params : undefined);

  // Safety cap for reads
  const maxRows = options.maxRows ?? 500;
  const rows = result.rows.slice(0, maxRows);

  return {
    rows,
    sql: sqlQuery,
    tables,
    statementType,
    rowCount: isWriteOperation(statementType) ? (result.rowCount ?? 0) : rows.length,
  };
}

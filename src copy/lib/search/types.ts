/**
 * Search Types
 */

export interface SearchResult<T> {
  record: T;
  score: number; // 0-1, higher is better
}

export interface SearchOptions {
  organizationId?: string;
  limit?: number;
  threshold?: number;
  /** Additional SQL JOIN clause injected after `FROM coznt.documents d` */
  join?: any;
  /** Additional SQL WHERE condition appended to the base filter */
  where?: any;
}

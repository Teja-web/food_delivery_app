/**
 * Entity Search Config — declares which entity tables are eligible for
 * semantic search via `dilliznt.documents` embeddings.
 *
 * Populate as SDLC entities opt in to embeddings.
 */

interface EntitySearchConfig {
  tableName: string;
  sourceTable: string;
  contentColumns: string[];
  metadataColumns: string[];
}

export const SEARCH_CONFIG: Record<string, EntitySearchConfig> = {};

/**
 * Entity Search Config — code-driven replacement for platform.data_sources.
 * Defines which columns to embed and serialize for each entity type.
 */

interface EntitySearchConfig {
  tableName: string;        // matches documents.tableName
  sourceTable: string;      // fully qualified SQL table name
  contentColumns: string[];
  metadataColumns: string[];
}

export const SEARCH_CONFIG: Record<string, EntitySearchConfig> = {
  candidate: {
    tableName: "candidates",
    sourceTable: "dilliznt.candidates",
    contentColumns: ["name", "location", "source", "resume_text"],
    metadataColumns: ["status"],
  },
  role: {
    tableName: "roles",
    sourceTable: "dilliznt.roles",
    contentColumns: ["title", "department", "description", "location"],
    metadataColumns: ["organization_id", "status"],
  },
  interview: {
    tableName: "interviews",
    sourceTable: "dilliznt.interviews",
    contentColumns: ["notes", "transcript"],
    metadataColumns: ["organization_id", "status"],
  },
};

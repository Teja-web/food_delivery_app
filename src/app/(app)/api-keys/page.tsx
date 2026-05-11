import { listApiKeysAction } from "@/actions/api-keys";
import { ApiKeysClient } from "./ApiKeysClient";
import { serializeApiKey } from "./serialize";

export default async function ApiKeysPage() {
  const keys = await listApiKeysAction();
  const rows = keys.map(serializeApiKey);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">API keys</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bearer tokens for the <code>/api/v1</code> agent surface. The plaintext is shown once on creation.
        </p>
      </div>
      <ApiKeysClient initialKeys={rows} />
    </div>
  );
}

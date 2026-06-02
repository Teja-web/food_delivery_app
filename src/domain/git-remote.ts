/**
 * Canonicalize a git remote URL so SSH and HTTPS variants of the same
 * repo collapse to one key. The output is the host + path component,
 * lowercased host, no protocol / user / password / `.git` suffix / trailing slash.
 *
 * Examples:
 *   https://github.com/foo/bar.git          → github.com/foo/bar
 *   git@github.com:foo/bar.git              → github.com/foo/bar
 *   https://USER:TOKEN@github.com/foo/bar/  → github.com/foo/bar
 *   ssh://git@gitlab.acme.internal:22/foo/bar.git → gitlab.acme.internal/foo/bar
 */

export function canonicalizeRemote(url: string): string {
  let working = url.trim();

  // Strip leading protocol: http(s)://, ssh://, git://, file://
  working = working.replace(/^[a-z]+:\/\//i, "");

  // Strip leading credentials: `user@` or `user:pass@`
  working = working.replace(/^[^@/]+@/, "");

  // After protocol + credential strip we may have:
  //   - host/path           (already clean)
  //   - host:port/path      (HTTPS-style port — protocol was stripped)
  //   - host:path           (SCP-style separator; `path` does NOT start with digits-only-then-slash)
  //
  // Distinguish by whether the post-colon segment is `digits(/|$)` (port)
  // vs anything else (SCP separator).
  working = working.replace(/^([^:/]+):(\d+)(\/|$)/, "$1$3");
  working = working.replace(/^([^:/]+):(?!\d+(?:\/|$))(.*)$/, "$1/$2");

  // Lowercase host (everything up to the first slash). Preserve path case.
  const firstSlash = working.indexOf("/");
  if (firstSlash > 0) {
    working = working.slice(0, firstSlash).toLowerCase() + working.slice(firstSlash);
  } else {
    working = working.toLowerCase();
  }

  // Strip trailing `.git`
  if (working.endsWith(".git")) {
    working = working.slice(0, -4);
  }

  // Strip trailing slash
  if (working.endsWith("/")) {
    working = working.slice(0, -1);
  }

  return working;
}

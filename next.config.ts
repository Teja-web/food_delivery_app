import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  serverExternalPackages: ["markitdown-ts", "pdf-parse", "pdfjs-dist"],

  // Keep runtime user content out of the build-time file trace. Without
  // this exclusion, dynamic `fs.readFile(${dir}/${file})` calls in
  // `src/lib/storage.ts` cause Turbopack to glob 10k+ files at build
  // time. (storage.ts uses `path.join` to limit the trace; this
  // exclusion is the belt-and-suspenders companion.)
  // In production: set STORAGE_PATH to a directory outside the project
  // root so the trace doesn't reach user content at all.
  outputFileTracingExcludes: {
    "*": [
      "data/**",
      "./data/**",
      ".next/cache/**",
      "node_modules/@swc/core-*/**",
      "node_modules/typescript/lib/typescript.js",
    ],
  },

  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },

  // COOP/COEP headers required for SharedArrayBuffer (used by ONNX WASM workers)
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
        ],
      },
    ];
  },
};

export default nextConfig;

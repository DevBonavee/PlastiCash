import { randomUUID } from "node:crypto";

import { createSerwistRoute } from "@serwist/turbopack";
import { cacheLife } from "next/cache";

// Builds app/sw.ts with esbuild and serves it at /serwist/sw.js (with Service-Worker-Allowed: / so it can control the
// whole site).
//
// A new revision on every build: the offline page's HTML points at this build's hashed JS and CSS, so it must be
// fetched again whenever they change (a git commit id would stay the same across uncommitted rebuilds).
const revision = randomUUID();

const serwist = createSerwistRoute({
  swSrc: "app/sw.ts",
  additionalPrecacheEntries: [{ url: "/offline", revision }],
  // Serwist's default list without .woff2: add the self-hosted fonts so offline pages keep the brand type.
  globPatterns: [".next/static/**/*.{js,css,ico,png,svg,webp,woff2,json,webmanifest}", "public/**/*"],
  useNativeEsbuild: true,
  esbuildOptions: {
    sourcemap: false, // like productionBrowserSourceMaps: false
    // The worker reads the API address to keep every API call network-only.
    define: { "process.env.NEXT_PUBLIC_API_URL": JSON.stringify(process.env.NEXT_PUBLIC_API_URL ?? "") },
  },
});

export const { generateStaticParams } = serwist;

// With Cache Components a route stops prerendering at file-system work (esbuild, globbing .next/static), and would
// then bundle the worker on every request. "use cache" keeps the result in the build output instead.
async function workerFile(path: string) {
  "use cache";
  cacheLife("max");
  const response = await serwist.GET(new Request(`http://localhost/serwist/${path}`), {
    params: Promise.resolve({ path }),
  });
  return { body: await response.text(), type: response.headers.get("Content-Type") ?? "application/javascript" };
}

export async function GET(_request: Request, { params }: { params: Promise<{ path: string }> }) {
  const { path } = await params;
  const file = await workerFile(path);
  if (!file.body) return new Response("Not found", { status: 404 });
  return new Response(file.body, { headers: { "Content-Type": file.type, "Service-Worker-Allowed": "/" } });
}

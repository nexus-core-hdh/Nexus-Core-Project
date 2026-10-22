// `next dev` only: same-origin proxy from /api/v1/* to the local NestJS backend (production serves
// /api/v1 from the reverse proxy and never reaches this route). See lib/dev-api-proxy.ts for why
// this replaced the plain rewrite and how backend outages are answered.
import { proxyToBackend } from "@/lib/dev-api-proxy";

export const dynamic = "force-dynamic";

const BACKEND_URL = (process.env.NEXUSCORE_BACKEND_URL || "http://localhost:4000").replace(/\/$/, "");

async function handle(request: Request): Promise<Response> {
  if (process.env.NODE_ENV !== "development") {
    return Response.json({ success: false, message: "Not Found" }, { status: 404 });
  }
  return proxyToBackend(request, { backendUrl: BACKEND_URL });
}

export { handle as GET, handle as HEAD, handle as POST, handle as PUT, handle as PATCH, handle as DELETE, handle as OPTIONS };

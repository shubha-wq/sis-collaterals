// Vercel function: POST /api/expand-image. Logic lives in server/expansion/handler.ts.
import { handleExpandImage } from "../server/expansion/handler";

export const config = { maxDuration: 60 };

export function POST(request: Request): Promise<Response> {
  return handleExpandImage(request, process.env);
}

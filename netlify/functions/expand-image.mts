// Netlify function, routed from /api/expand-image (netlify.toml). Logic lives in server/expansion/handler.ts.
import { handleExpandImage } from "../../server/expansion/handler";

export default (request: Request): Promise<Response> => handleExpandImage(request, process.env);

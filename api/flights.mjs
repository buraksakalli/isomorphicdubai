// Vercel serverless function: GET /api/flights → live aircraft around Dubai.
// Same relay as the local dev server (tools/serve.mjs); see tools/flights-relay.mjs for sources, limits and safety.
import { handleFlights } from '../tools/flights-relay.mjs';

export default function handler(req, res) {
  if (!handleFlights(req, res, { cdn: true })) { res.statusCode = 404; res.end(); }
}

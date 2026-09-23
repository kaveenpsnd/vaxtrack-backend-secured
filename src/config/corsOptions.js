// CORS policy for the API.
//
// Previously the app called `cors()` with no options, which answers every
// request with `Access-Control-Allow-Origin: *` and approves every preflight.
// That lets a script on ANY website call this API from a visitor's browser and
// read the JSON response (Finding #6). We now answer with the CORS headers only
// for the origins we actually ship a browser client on.
//
// Origins are read from the CORS_ORIGINS env var (comma-separated). If it is
// unset we fall back to the deployed frontend plus the local Vite dev server.

const DEFAULT_ALLOWED_ORIGINS = [
  'https://vaxtrackweb.netlify.app', // deployed frontend
  'http://localhost:5173', // local Vite dev server
];

/**
 * Splits a comma-separated origin list into a clean array.
 *
 * @param {string} value - Raw env var value (e.g. "https://a.app, http://localhost:5173")
 * @returns {string[]} Trimmed, non-empty origins
 */
export const parseOrigins = (value) => {
  if (typeof value !== 'string') return [];
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
};

/**
 * The origins allowed to call this API from a browser.
 * Read lazily (not at import time) so dotenv.config() has already run.
 *
 * @returns {string[]} Allowed origins
 */
export const getAllowedOrigins = () => {
  const configured = parseOrigins(process.env.CORS_ORIGINS);
  return configured.length > 0 ? configured : DEFAULT_ALLOWED_ORIGINS;
};

/**
 * Origin check used by the cors middleware.
 * Unknown origins get no Access-Control-Allow-Origin header, so the browser
 * blocks the response. We do not throw — an unknown origin is a normal event,
 * not a server error.
 *
 * @param {string|undefined} origin - Value of the request's Origin header
 * @param {Function} callback - cors callback(err, allowed)
 */
export const originChecker = (origin, callback) => {
  // No Origin header: not a cross-origin browser request (curl, Postman,
  // server-to-server, same-origin navigation). CORS does not apply.
  if (!origin) return callback(null, true);

  return callback(null, getAllowedOrigins().includes(origin));
};

const corsOptions = {
  origin: originChecker,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  // The API authenticates with a Bearer token or cookie, so only these two are needed.
  allowedHeaders: ['Content-Type', 'Authorization'],
  // Secure cookies are used for auth. Allowed origins are strictly validated via originChecker.
  credentials: true,
  optionsSuccessStatus: 204,
  maxAge: 600, // cache preflight results for 10 minutes
};

export default corsOptions;

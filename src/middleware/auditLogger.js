const jwt = require("jsonwebtoken");
const sql = require("../controllers/db");
const { ACCESS_TOKEN_SECRET } = require("../../config");

const getActorIdFromReq = (req) => {
  if (req?.user?.id) return Number(req.user.id);

  const authHeader = req?.headers?.authorization;
  if (!authHeader) return null;

  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) return null;

  try {
    const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET);
    const uid = Number(decoded?.id);
    return Number.isInteger(uid) ? uid : null;
  } catch {
    return null;
  }
};

const pickSafeBody = (req) => {
  const b = req.body || {};
  const blockedKeys = new Set([
    "password",
    "confirmPassword",
    "newPassword",
    "currentPassword",
    "refresh_token_hash",
    "refreshToken",
    "accessToken",
    "token",
    "verificationCode",
    "verification_code",
  ]);

  const out = {};
  for (const [k, v] of Object.entries(b)) {
    if (blockedKeys.has(k)) continue;

    if (typeof v === "string") out[k] = v.slice(0, 200);
    else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (v && typeof v === "object") out[k] = "[object]";
    else out[k] = v;
  }
  return out;
};

const severityFromStatus = (code) => {
  if (code >= 500) return "ERROR";
  if (code >= 400) return "WARN";
  return "INFO";
};

const auditLogger = (options = {}) => {
  const {
    enabled = true,
    onlyPaths = null,
    ignorePaths = ["/refresh", "/health", "/uploads", "/static"],
  } = options;

  return async (req, res, next) => {
    if (!enabled) return next();

    const path = req.originalUrl || req.url || "";
    const method = req.method || "GET";

    if (Array.isArray(ignorePaths) && ignorePaths.some((p) => path.startsWith(p))) {
      return next();
    }
    if (Array.isArray(onlyPaths) && !onlyPaths.some((p) => path.startsWith(p))) {
      return next();
    }

    const startedAt = Date.now();

    res.on("finish", async () => {
      try {
        const actor_user_id = getActorIdFromReq(req);

        const ip =
          req.headers["x-forwarded-for"]?.toString()?.split(",")?.[0]?.trim() ||
          req.socket?.remoteAddress ||
          null;

        const user_agent = req.headers["user-agent"] || null;
        const request_id = req.headers["x-request-id"] || null;

        const status = res.statusCode || 0;
        const severity = severityFromStatus(status);

        const meta = {
          method,
          path,
          status,
          duration_ms: Date.now() - startedAt,
          query: req.query || {},
          body: pickSafeBody(req),
        };

        const event_type = "HTTP";
        const action = `${method} ${path}`.slice(0, 128);

        await sql`
          INSERT INTO event_log (
            actor_user_id, event_type, action, severity,
            message, target_table, target_id,
            meta, ip, user_agent, request_id
          )
          VALUES (
            ${actor_user_id}, ${event_type}, ${action}, ${severity},
            ${null}, ${null}, ${null},
            ${sql.json(meta)}, ${ip}, ${user_agent}, ${request_id}
          )
        `;
      } catch (e) {
        console.error("auditLogger error:", e?.message || e);
      }
    });

    next();
  };
};

module.exports = auditLogger;

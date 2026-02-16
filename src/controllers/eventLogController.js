const sql = require("./db");

const parseIntSafe = (v, def) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : def;
};

const normalizeSeverity = (s) => {
  const up = String(s || "INFO").toUpperCase();
  return ["INFO", "WARN", "ERROR"].includes(up) ? up : "INFO";
};

const normalizeType = (v) => String(v || "").trim().slice(0, 64);
const normalizeAction = (v) => String(v || "").trim().slice(0, 128);

const safeText = (v, max = 500) => {
  const s = v == null ? "" : String(v);
  return s.length > max ? s.slice(0, max) : s;
};

const getActorIdFromReq = (req) => {
  return (
    req?.user?.id ??
    req?.userId ??
    req?.user_id ??
    null
  );
};

const createEvent = async (req, res) => {
  try {
    const actor_user_id = getActorIdFromReq(req);

    const event_type = normalizeType(req.body?.event_type);
    const action = normalizeAction(req.body?.action);
    const severity = normalizeSeverity(req.body?.severity);
    const message = req.body?.message == null ? null : safeText(req.body.message, 2000);

    const target_table = req.body?.target_table == null ? null : safeText(req.body.target_table, 64);
    const target_id =
      req.body?.target_id == null || req.body?.target_id === ""
        ? null
        : parseIntSafe(req.body.target_id, null);

    const meta =
      req.body?.meta && typeof req.body.meta === "object" && !Array.isArray(req.body.meta)
        ? req.body.meta
        : {};

    if (!event_type || !action) {
      return res.status(400).json({ message: "event_type and action are required" });
    }

    const ip =
      req.headers["x-forwarded-for"]?.toString()?.split(",")?.[0]?.trim() ||
      req.socket?.remoteAddress ||
      null;

    const user_agent = req.headers["user-agent"] || null;
    const request_id = req.headers["x-request-id"] || null;

    const inserted = await sql`
      INSERT INTO event_log (
        actor_user_id, event_type, action, severity, message,
        target_table, target_id, meta, ip, user_agent, request_id
      )
      VALUES (
        ${actor_user_id}, ${event_type}, ${action}, ${severity}, ${message},
        ${target_table}, ${target_id}, ${sql.json(meta)}, ${ip}, ${user_agent}, ${request_id}
      )
      RETURNING id, created_at
    `;

    return res.status(201).json({ result: inserted?.[0] || null });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

const getEvents = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseIntSafe(req.query.limit, 50), 1), 200);
    const offset = Math.max(parseIntSafe(req.query.offset, 0), 0);

    const severity = req.query.severity ? normalizeSeverity(req.query.severity) : null;
    const event_type = req.query.type ? normalizeType(req.query.type) : null;
    const actor_user_id = req.query.actor_user_id
      ? parseIntSafe(req.query.actor_user_id, null)
      : null;

    const q = req.query.q ? String(req.query.q).trim() : "";
    const like = q ? `%${q.toLowerCase()}%` : null;

    const rows = await sql`
      SELECT
        e.id, e.created_at, e.actor_user_id, e.event_type, e.action, e.severity,
        e.message, e.target_table, e.target_id, e.meta, e.ip, e.user_agent, e.request_id,
        u.email AS actor_email, u.name AS actor_name, u.surname AS actor_surname
      FROM event_log e
      LEFT JOIN users u ON u.id = e.actor_user_id
      WHERE
        (${severity}::text IS NULL OR e.severity = ${severity})
        AND (${event_type}::text IS NULL OR e.event_type = ${event_type})
        AND (${actor_user_id}::int IS NULL OR e.actor_user_id = ${actor_user_id})
        AND (
          ${like}::text IS NULL OR
          LOWER(COALESCE(e.event_type,'')) LIKE ${like} OR
          LOWER(COALESCE(e.action,'')) LIKE ${like} OR
          LOWER(COALESCE(e.message,'')) LIKE ${like} OR
          LOWER(COALESCE(e.target_table,'')) LIKE ${like} OR
          LOWER(COALESCE(e.meta::text,'')) LIKE ${like} OR
          LOWER(COALESCE(u.email,'')) LIKE ${like} OR
          LOWER(COALESCE(u.name,'')) LIKE ${like} OR
          LOWER(COALESCE(u.surname,'')) LIKE ${like}
        )
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const total = await sql`
      SELECT COUNT(*)::int AS cnt
      FROM event_log e
      LEFT JOIN users u ON u.id = e.actor_user_id
      WHERE
        (${severity}::text IS NULL OR e.severity = ${severity})
        AND (${event_type}::text IS NULL OR e.event_type = ${event_type})
        AND (${actor_user_id}::int IS NULL OR e.actor_user_id = ${actor_user_id})
        AND (
          ${like}::text IS NULL OR
          LOWER(COALESCE(e.event_type,'')) LIKE ${like} OR
          LOWER(COALESCE(e.action,'')) LIKE ${like} OR
          LOWER(COALESCE(e.message,'')) LIKE ${like} OR
          LOWER(COALESCE(e.target_table,'')) LIKE ${like} OR
          LOWER(COALESCE(e.meta::text,'')) LIKE ${like} OR
          LOWER(COALESCE(u.email,'')) LIKE ${like} OR
          LOWER(COALESCE(u.name,'')) LIKE ${like} OR
          LOWER(COALESCE(u.surname,'')) LIKE ${like}
        )
    `;

    return res.json({
      result: rows,
      pagination: { limit, offset, total: total?.[0]?.cnt ?? 0 },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

const clearEvents = async (req, res) => {
  try {
    const beforeDays = Math.max(parseIntSafe(req.query.before_days, 0), 0);

    let deleted;
    if (beforeDays > 0) {
      deleted = await sql`
        DELETE FROM event_log
        WHERE created_at < NOW() - (${beforeDays}::int * INTERVAL '1 day')
        RETURNING id
      `;
    } else {
      deleted = await sql`DELETE FROM event_log RETURNING id`;
    }

    return res.json({ deleted: deleted.length });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports = {
  createEvent,
  getEvents,
  clearEvents,
};

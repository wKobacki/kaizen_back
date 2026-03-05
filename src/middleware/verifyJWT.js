const jwt = require("jsonwebtoken");
const sql = require("../controllers/db");
const { ACCESS_TOKEN_SECRET } = require("../../config");

const verifyJWT = async (req, res, next) => {
  try {
    const authHeader = req?.headers?.authorization;
    if (!authHeader) return res.sendStatus(401);

    const [scheme, token] = String(authHeader).split(" ");
    if (scheme !== "Bearer" || !token) return res.sendStatus(401);

    let decoded;
    try {
      decoded = jwt.verify(token, ACCESS_TOKEN_SECRET);
    } catch (e) {
      return res.sendStatus(401);
    }

    if (decoded?.type !== "access") return res.sendStatus(401);

    const userId = Number(decoded?.id);
    if (!Number.isInteger(userId)) return res.sendStatus(401);

    const [u] = await sql`
      SELECT
        u.id,
        u.email,
        u.role_id,
        r.name AS role_name,
        u.department_id,
        u.location_id,
        u.is_verified
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.id = ${userId}
      LIMIT 1
    `;

    if (!u) return res.sendStatus(401);

    req.user = {
      id: u.id,
      email: u.email,
      role_id: u.role_id,
      role_name: u.role_name,
      department_id: u.department_id,
      location_id: u.location_id,
      is_verified: u.is_verified,
    };

    req.token = decoded;

    return next();
  } catch (err) {
    console.error("verifyJWT ERROR:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = verifyJWT;
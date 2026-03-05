const jwt = require("jsonwebtoken");
const sql = require("./db");
const { REFRESH_TOKEN_SECRET } = require("../../config");
const {
  refreshCookieOptions,
  signAccessToken,
  signRefreshToken,
  hashRefreshToken,
  compareRefreshToken,
} = require("../services/authTokens"); 

const handleRefreshToken = async (req, res) => {
  try {
    const cookies = req.cookies;
    if (!cookies?.jwt) return res.sendStatus(401);

    const refreshToken = String(cookies.jwt);

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);
    } catch (err) {
      res.clearCookie("jwt", refreshCookieOptions);
      return res.sendStatus(403);
    }

    if (decoded?.type !== "refresh") {
      res.clearCookie("jwt", refreshCookieOptions);
      return res.sendStatus(403);
    }

    const userId = Number(decoded?.id);
    if (!Number.isInteger(userId)) {
      res.clearCookie("jwt", refreshCookieOptions);
      return res.sendStatus(403);
    }

    const foundUser = await sql`
      SELECT id, email, role_id, department_id, is_verified, refresh_token_hash
      FROM users
      WHERE id = ${userId}
      LIMIT 1
    `;

    if (foundUser.length === 0) {
      res.clearCookie("jwt", refreshCookieOptions);
      return res.sendStatus(403);
    }

    const user = foundUser[0];

    if (String(user.email) !== String(decoded.email || "")) {
      res.clearCookie("jwt", refreshCookieOptions);
      return res.sendStatus(403);
    }

    const tokenMatches = await compareRefreshToken(refreshToken, user.refresh_token_hash);
    if (!tokenMatches) {
      res.clearCookie("jwt", refreshCookieOptions);
      return res.sendStatus(403);
    }

    const newRefreshToken = signRefreshToken(user);
    const newRefreshTokenHash = await hashRefreshToken(newRefreshToken);

    const accessToken = signAccessToken(user);

    await sql`
      UPDATE users
      SET refresh_token_hash = ${newRefreshTokenHash}
      WHERE id = ${user.id}
    `;

    res.cookie("jwt", newRefreshToken, refreshCookieOptions);

    return res.json({
      uid: user.id,
      role_id: user.role_id,
      department_id: user.department_id,
      is_verified: user.is_verified,
      accessToken,
    });
  } catch (err) {
    console.error("handleRefreshToken ERROR:", err);
    return res.sendStatus(500);
  }
};

module.exports = { handleRefreshToken };
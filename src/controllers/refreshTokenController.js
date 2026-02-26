const jwt = require("jsonwebtoken");
const sql = require("./db");
const { REFRESH_TOKEN_SECRET, ACCESS_TOKEN_SECRET } = require("../../config");

const handleRefreshToken = async (req, res) => {
  try {
    const cookies = req.cookies;
    if (!cookies?.jwt) return res.sendStatus(401);

    const refreshToken = cookies.jwt;

    const foundUser = await sql`
      SELECT id, email, role_id, department_id, is_verified, refresh_token
      FROM users
      WHERE refresh_token = ${refreshToken}
      LIMIT 1
    `;

    if (foundUser.length === 0) return res.sendStatus(403);

    jwt.verify(refreshToken, REFRESH_TOKEN_SECRET, (err, decoded) => {
      if (err || foundUser[0].email !== decoded.email) return res.sendStatus(403);

      const accessToken = jwt.sign(
        {
          id: foundUser[0].id,
          email: foundUser[0].email,
          role_id: foundUser[0].role_id,
          department_id: foundUser[0].department_id,
        },
        ACCESS_TOKEN_SECRET,
        { expiresIn: "15m" }
      );

      return res.json({
        uid: foundUser[0].id,
        role_id: foundUser[0].role_id,
        department_id: foundUser[0].department_id,
        is_verified: foundUser[0].is_verified,
        accessToken,
      });
    });
  } catch (err) {
    console.error("handleRefreshToken ERROR:", err);
    return res.sendStatus(500);
  }
};

module.exports = { handleRefreshToken };
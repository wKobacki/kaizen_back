const jwt = require("jsonwebtoken");
const sql = require("./db");
const { REFRESH_TOKEN_SECRET } = require("../../config");
const { refreshCookieOptions } = require("../services/authTokens"); 

const handleLogout = async (req, res) => {
  try {
    const cookies = req.cookies;

    if (!cookies?.jwt) {
      res.clearCookie("jwt", refreshCookieOptions);
      return res.sendStatus(204);
    }

    const refreshToken = String(cookies.jwt);

    try {
      const decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);

      if (decoded?.type === "refresh" && Number.isInteger(Number(decoded?.id))) {
        const userId = Number(decoded.id);

        await sql`
          UPDATE users
          SET refresh_token_hash = NULL
          WHERE id = ${userId}
        `;
      }
    } catch (err) {
      // token uszkodzony wiec zosawic puste, 
    }

    res.clearCookie("jwt", refreshCookieOptions);
    return res.sendStatus(204);
  } catch (err) {
    console.error("handleLogout ERROR:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports = { handleLogout };
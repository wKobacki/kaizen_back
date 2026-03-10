const bcrypt = require("bcrypt");
const sql = require("./db");
const {
  refreshCookieOptions,
  signAccessToken,
  signRefreshToken,
  hashRefreshToken,
} = require("../services/authTokens");

const handleLogin = async (req, res) => {
  try {
    const { email: rawEmail, password: rawPassword } = req.body || {};

    if (rawEmail == null || rawPassword == null) {
      return res.status(400).json({ message: "Email i hasło są wymagane" });
    }

    const email = String(rawEmail).trim().toLowerCase();
    const password = String(rawPassword);

    if (!email || !password) {
      return res.status(400).json({ message: "Email i hasło są wymagane" });
    }

    const foundUser = await sql`
      SELECT
        id,
        email,
        password,
        role_id,
        department_id,
        is_verified
      FROM users
      WHERE LOWER(email) = ${email}
      LIMIT 1
    `;

    if (foundUser.length === 0) {
      return res.status(401).json({ message: "Nieprawidłowy email lub hasło" });
    }

    const user = foundUser[0];

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: "Nieprawidłowy email lub hasło" });
    }

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    const refreshTokenHash = await hashRefreshToken(refreshToken);

    await sql`
      UPDATE users
      SET
        refresh_token_hash = ${refreshTokenHash},
        last_login = NOW()
      WHERE id = ${user.id}
    `;

    res.cookie("jwt", refreshToken, refreshCookieOptions);

    return res.json({
      uid: user.id,
      role_id: user.role_id,
      department_id: user.department_id,
      is_verified: user.is_verified,
      accessToken,
    });
  } catch (error) {
    console.error("handleLogin ERROR:", error);

    if (error.code === "42703") {
      return res.status(500).json({
        message: "Missing database column. Run migration first.",
      });
    }

    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { handleLogin };
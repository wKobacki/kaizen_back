const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const sql = require("./db");
const { ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET } = require("../../config");

const handleLogin = async (req, res) => {
  try {
    const { email: rawEmail, password: rawPassword } = req.body || {};

    if (rawEmail == null || rawPassword == null) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const email = String(rawEmail).trim().toLowerCase();
    const password = String(rawPassword);

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
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
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = foundUser[0];

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const tokenPayload = {
      id: user.id,
      email: user.email,
      role_id: user.role_id,
      department_id: user.department_id,
    };

    const accessToken = jwt.sign(tokenPayload, ACCESS_TOKEN_SECRET, {
      expiresIn: "15m",
    });

    const refreshToken = jwt.sign(tokenPayload, REFRESH_TOKEN_SECRET, {
      expiresIn: "1d",
    });

    await sql`
      UPDATE users
      SET
        refresh_token = ${refreshToken},
        last_login = NOW()
      WHERE id = ${user.id}
    `;

    res.cookie("jwt", refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    });

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
        message: "Missing database column (e.g. last_login). Run migration first.",
      });
    }

    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { handleLogin };
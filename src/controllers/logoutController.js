const sql = require("./db");

const handleLogout = async (req, res) => {
  try {
    const cookies = req.cookies;

    if (!cookies?.jwt) return res.sendStatus(204);

    const refreshToken = cookies.jwt;

    const foundUser = await sql`
      SELECT id
      FROM users
      WHERE refresh_token = ${refreshToken}
      LIMIT 1
    `;

    if (foundUser.length > 0) {
      await sql`
        UPDATE users
        SET refresh_token = NULL
        WHERE refresh_token = ${refreshToken}
      `;
    }

    res.clearCookie("jwt", {
      httpOnly: true,
      secure: false, // w prod: true (HTTPS)
      sameSite: "lax",
    });

    return res.sendStatus(204);
  } catch (err) {
    console.error("handleLogout ERROR:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports = { handleLogout };
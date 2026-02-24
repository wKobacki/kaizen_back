const sql = require("./db");

const getMe = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.sendStatus(401);

    const [u] = await sql`
      SELECT id, email, role_id, department_id, location_id, is_verified
      FROM users
      WHERE id = ${userId}
      LIMIT 1
    `;

    if (!u) return res.sendStatus(401);

    return res.json({
      user: {
        id: u.id,
        email: u.email,
        role_id: u.role_id,
        department_id: u.department_id,
        location_id: u.location_id,
        is_verified: u.is_verified,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { getMe };
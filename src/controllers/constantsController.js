const sql = require("./db");

const getRoles = async (req, res) => {
  try {
    const rows = await sql`
      SELECT id, code, name
      FROM roles
      ORDER BY id ASC
    `;
    return res.json({ res: rows });
  } catch (e) {
    console.error("getRoles ERROR:", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const getIdeaStatuses = async (req, res) => {
  try {
    const rows = await sql`
      SELECT id, code, name
      FROM idea_statuses
      ORDER BY id ASC
    `;
    return res.json({ res: rows });
  } catch (e) {
    console.error("getIdeaStatuses ERROR:", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { getRoles, getIdeaStatuses };
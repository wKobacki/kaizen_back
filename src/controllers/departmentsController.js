const sql = require("./db");

// GET /departments
const getAllDepartments = async (req, res) => {
  try {
    const rows = await sql`
      SELECT
        d.id,
        d.name,
        d.supervisor_user_id,
        u.email  AS supervisor_email,
        u.name   AS supervisor_name,
        u.surname AS supervisor_surname
      FROM departments d
      LEFT JOIN users u ON u.id = d.supervisor_user_id
      ORDER BY d.name ASC
    `;

    return res.json({ result: rows });
  } catch (error) {
    console.error("Error fetching departments:", error);
    return res.status(500).json({ message: "An error occurred while fetching departments." });
  }
};

// PUT /departments/:id/supervisor
const updateDepartmentSupervisor = async (req, res) => {
  try {
    const deptId = Number(req.params.id);
    const supervisor_user_id = req.body?.supervisor_user_id ?? null;

    if (!Number.isInteger(deptId) || deptId <= 0) {
      return res.status(400).json({ message: "Invalid department id" });
    }

    // pozwól na null (czyli "brak przełożonego") lub liczbę
    let supId = null;
    if (supervisor_user_id !== null && supervisor_user_id !== undefined && supervisor_user_id !== "") {
      supId = Number(supervisor_user_id);
      if (!Number.isInteger(supId) || supId <= 0) {
        return res.status(400).json({ message: "Invalid supervisor_user_id" });
      }

      const sup = await sql`SELECT id FROM users WHERE id = ${supId} LIMIT 1`;
      if (sup.length === 0) return res.status(400).json({ message: "Supervisor user not found" });
    }

    const dep = await sql`SELECT id FROM departments WHERE id = ${deptId} LIMIT 1`;
    if (dep.length === 0) return res.status(404).json({ message: "Department not found" });

    const updated = await sql`
      UPDATE departments
      SET supervisor_user_id = ${supId}
      WHERE id = ${deptId}
      RETURNING id, name, supervisor_user_id
    `;

    return res.json({ result: updated[0] });
  } catch (error) {
    console.error("Error updating supervisor:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports = {
  getAllDepartments,
  updateDepartmentSupervisor,
};

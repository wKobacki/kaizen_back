const sql = require("./db");

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

const updateDepartmentSupervisor = async (req, res) => {
  try {
    const deptId = Number(req.params.id);
    const supervisor_user_id = req.body?.supervisor_user_id ?? null;

    if (!Number.isInteger(deptId) || deptId <= 0) {
      return res.status(400).json({ message: "Invalid department id" });
    }

    let supId = null;
    if (supervisor_user_id !== null && supervisor_user_id !== undefined && supervisor_user_id !== "") {
      supId = Number(supervisor_user_id);
      if (!Number.isInteger(supId) || supId <= 0) {
        return res.status(400).json({ message: "Invalid supervisor_user_id" });
      }
    }

    const result = await sql.begin(async (tx) => {
      const [depRow] = await tx`
        SELECT id, supervisor_user_id
        FROM departments
        WHERE id = ${deptId}
        LIMIT 1
      `;
      if (!depRow) {
        return { error: { status: 404, message: "Department not found" } };
      }

      const oldSupId = depRow.supervisor_user_id ? Number(depRow.supervisor_user_id) : null;

      if (supId) {
        const [u] = await tx`SELECT id, role_id FROM users WHERE id = ${supId} LIMIT 1`;
        if (!u) {
          return { error: { status: 400, message: "Supervisor user not found" } };
        }
      }

      const [updatedDep] = await tx`
        UPDATE departments
        SET supervisor_user_id = ${supId}
        WHERE id = ${deptId}
        RETURNING id, name, supervisor_user_id
      `;

      const ROLE_ADMIN = 1;
      const ROLE_USER = 2;
      const ROLE_SUPERVISOR = 4;
      const ROLE_DIRECTOR = 5;

      const isProtectedRole = (roleId) => roleId === ROLE_ADMIN || roleId === ROLE_DIRECTOR;

      if (supId) {
        const [newU] = await tx`SELECT id, role_id FROM users WHERE id = ${supId} LIMIT 1`;
        if (newU && !isProtectedRole(Number(newU.role_id)) && Number(newU.role_id) !== ROLE_SUPERVISOR) {
          await tx`
            UPDATE users
            SET role_id = ${ROLE_SUPERVISOR}
            WHERE id = ${supId}
          `;
        }
      }

      if (oldSupId && oldSupId !== supId) {
        const [oldU] = await tx`SELECT id, role_id FROM users WHERE id = ${oldSupId} LIMIT 1`;

        if (oldU && !isProtectedRole(Number(oldU.role_id)) && Number(oldU.role_id) === ROLE_SUPERVISOR) {
          const [{ cnt }] = await tx`
            SELECT COUNT(*)::int AS cnt
            FROM departments
            WHERE supervisor_user_id = ${oldSupId}
          `;

          if (Number(cnt) === 0) {
            await tx`
              UPDATE users
              SET role_id = ${ROLE_USER}
              WHERE id = ${oldSupId}
            `;
          }
        }
      }

      return { updatedDep };
    });

    if (result?.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    return res.json({ result: result.updatedDep });
  } catch (error) {
    console.error("Error updating supervisor:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports = {
  getAllDepartments,
  updateDepartmentSupervisor,
};

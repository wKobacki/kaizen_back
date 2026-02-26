const express = require('express');
const sql = require('./db.js');
const bcrypt = require('bcrypt');

const getUserDetails = async (req, res) => {
  try {
    const userId = Number(req.params?.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const rows = await sql`
      SELECT 
        u.id,
        u.name,
        u.surname,
        u.email,
        u.role_id,
        r.name AS role_name,
        u.department_id,
        d.name AS department_name,
        u.location_id,
        l.name AS location_name,
        u.supervisor,
        s.name AS supervisor_name,
        s.surname AS supervisor_surname,
        s.email AS supervisor_email,
        u.is_verified,
        u.verification_code,
        u.created_at,
        u.last_login
      FROM users u
      LEFT JOIN users s ON s.id = u.supervisor
      LEFT JOIN location l ON l.id = u.location_id
      LEFT JOIN departments d ON d.id = u.department_id
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.id = ${userId}
      LIMIT 1
    `;

    const user = rows?.[0];
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json(user);
  } catch (error) {
    console.error("getUserDetails ERROR:", error);

    if (error.code === "42703") {
      return res.status(500).json({
        message: "Missing database column in users table.",
      });
    }

    return res.status(500).json({ message: "Internal server error" });
  }
};

const updateUserRole = async (req, res) => {
    try {
        const userId = req.params?.id;
        const { role_id } = req.body;

        if (!userId) return res.status(400).json({ message: 'User ID is required' });
        if (!role_id) return res.status(400).json({ message: 'role_id is required' });

        const updated = await sql`
            UPDATE users
            SET role_id = ${role_id}
            WHERE id = ${userId}
            RETURNING id
        `;

        if (updated.length === 0) return res.status(404).json({ message: 'User not found' });

        return res.json({ message: "User role updated successfully" });
    } catch (error) {
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const updateUserBranch = async (req, res) => {
    try {
        const userId = req.params?.id;
        const { location_id } = req.body;

        if (!userId) return res.status(400).json({ message: 'User ID is required' });
        if (!location_id) return res.status(400).json({ message: 'location_id is required' });

        const updated = await sql`
            UPDATE users
            SET location_id = ${location_id}
            WHERE id = ${userId}
            RETURNING id
        `;

        if (updated.length === 0) return res.status(404).json({ message: 'User not found' });

        return res.json({ message: "User location updated successfully" });
    } catch (error) {
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const deleteUser = async (req, res) => {
    try {
        const userId = req.params?.id;
        if (!userId) return res.status(400).json({ message: 'User ID is required' });

        const existing = await sql`
            SELECT id FROM users WHERE id = ${userId}
        `;
        if (existing.length === 0) return res.status(404).json({ message: 'User not found' });

        await sql`
            DELETE FROM ideas
            WHERE user_id = ${userId}
        `;

        await sql`
            DELETE FROM users
            WHERE id = ${userId}
        `;

        return res.json({ message: 'User deleted successfully' });
    } catch (error) {
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const getUsers = async (req, res) => {
  try {
    const rows = await sql`
      SELECT
        u.id,
        u.name,
        u.surname,
        u.email,
        u.role_id,
        r.name AS role_name,
        u.department_id,
        d.name AS department_name,
        u.location_id,
        l.name AS location_name,
        u.supervisor,
        s.name AS supervisor_name,
        s.surname AS supervisor_surname,
        u.is_verified
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      LEFT JOIN departments d ON d.id = u.department_id
      LEFT JOIN location l ON l.id = u.location_id
      LEFT JOIN users s ON s.id = u.supervisor
      ORDER BY u.surname ASC
    `;
    return res.json({ res: rows });
  } catch (error) {
    console.error("getUsers ERROR:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const getProfileInfo = async (req, res) => {
  try {
    const userId = req.params?.id;
    if (!userId) return res.status(400).json({ message: "User id is required" });

    const profile = await sql`
      SELECT 
        u.id,
        u.name,
        u.surname,
        u.email,
        u.role_id,
        r.name AS role_name,

        u.supervisor,
        s.name AS supervisor_name,
        s.surname AS supervisor_surname,

        u.department_id,
        d.name AS department_name,

        u.location_id,
        l.name AS location_name

      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      LEFT JOIN users s ON s.id = u.supervisor
      LEFT JOIN departments d ON d.id = u.department_id
      LEFT JOIN location l ON l.id = u.location_id
      WHERE u.id = ${userId}
      LIMIT 1;
    `;

    if (profile.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({ message: "Success", result: [profile[0]] });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const updateProfileInfo = async (req, res) => {
    try {
        const userId = req.params?.id;
        if (!userId) return res.status(400).json({ message: "User ID is required" });

        const { name, surname, email, supervisor, department_id, location_id } = req.body;

        const [existing] = await sql`
            SELECT id FROM users WHERE id = ${userId}
        `;
        if (!existing) return res.status(404).json({ message: "User not found" });

        if (supervisor !== undefined && supervisor !== null) {
            const [sup] = await sql`SELECT id FROM users WHERE id = ${supervisor}`;
            if (!sup) return res.status(400).json({ message: "Supervisor does not exist" });
            if (Number(supervisor) === Number(userId))
                return res.status(400).json({ message: "User cannot be their own supervisor" });
        }

        const fieldsToUpdate = {};
        if (name !== undefined) fieldsToUpdate.name = name;
        if (surname !== undefined) fieldsToUpdate.surname = surname;
        if (email !== undefined) fieldsToUpdate.email = email;
        if (department_id !== undefined) fieldsToUpdate.department_id = department_id;
        if (location_id !== undefined) fieldsToUpdate.location_id = location_id;
        if (supervisor !== undefined) fieldsToUpdate.supervisor = supervisor;

        await sql`
            UPDATE users SET ${sql(fieldsToUpdate)} WHERE id = ${userId}
        `;

        return res.json({ message: "Profile updated successfully" });

    } catch (error) {
        console.error(error);

        if (error.code === '23505') {
            return res.status(400).json({ message: "Email already exists" });
        }

        return res.status(500).json({ message: "Internal server error", error });
    }
};

const updateCurrentUserPassword = async (req, res) => {
    try {
        const userId = req.user.id;
        const { oldPassword, newPassword } = req.body;

        if (!oldPassword || !newPassword)
            return res.status(400).json({ message: "Both old and new password are required" });

        if (oldPassword === newPassword)
            return res.status(400).json({ message: "New password cannot be the same as old password" });

        const [user] = await sql`
            SELECT password FROM users WHERE id = ${userId}
        `;
        if (!user) return res.status(404).json({ message: "User not found" });

        const match = await bcrypt.compare(oldPassword, user.password);
        if (!match) return res.status(401).json({ message: "Incorrect old password" });

        const hashed = await bcrypt.hash(newPassword, 10);

        await sql`
            UPDATE users
            SET password = ${hashed}
            WHERE id = ${userId}
        `;

        return res.json({ message: "Password changed successfully" });
    } catch (err) {
        return res.status(500).json({ message: "Internal server error" });
    }
};

const getManagers = async (req, res) => {
    try {
        const rows = await sql`
            SELECT id, name, surname
            FROM users
            WHERE role_id IN (2, 3, 4)
            ORDER BY surname ASC
        `;

        return res.json({ result: rows });
    } catch (err) {
        return res.status(500).json({ message: "Failed to load managers list" });
    }
};

const getBranches = async (req, res) => {
    try {
        const rows = await sql`
            SELECT id, name 
            FROM departments
            ORDER BY name ASC
        `;
        return res.json({ result: rows });
    } catch (err) {
        return res.status(500).json({ message: "Failed to load branches list" });
    }
};

const getLocations = async (req, res) => {
    try {
        const rows = await sql`
            SELECT id, name 
            FROM location
            ORDER BY name ASC
        `;
        return res.json({ result: rows });
    } catch (err) {
        return res.status(500).json({ message: "Failed to load locations list" });
    }
};

const updateUserAdmin = async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    const {
      email,
      name,
      surname,
      role_id,
      department_id,
      location_id,
      supervisor,
      is_verified,
    } = req.body || {};

    if (!email || String(email).trim().length < 3) {
      return res.status(400).json({ message: "Email is required" });
    }

    const toNullableInt = (v) => {
      if (v === "" || v === undefined || v === null) return null;
      const n = Number(v);
      return Number.isInteger(n) ? n : NaN;
    };

    const nRole = toNullableInt(role_id);
    const nDept = toNullableInt(department_id);
    const nLoc = toNullableInt(location_id);
    const nSup = toNullableInt(supervisor);

    for (const [k, v] of [
      ["role_id", nRole],
      ["department_id", nDept],
      ["location_id", nLoc],
      ["supervisor", nSup],
    ]) {
      if (v === null) continue;
      if (!Number.isInteger(v) || v <= 0) {
        return res.status(400).json({ message: `Invalid ${k}` });
      }
    }

    if (nSup !== null && nSup === userId) {
      return res.status(400).json({ message: "User cannot be their own supervisor" });
    }

    const [updated] = await sql`
      UPDATE users
      SET
        email = ${String(email).trim()},
        name = ${String(name || "").trim()},
        surname = ${String(surname || "").trim()},
        role_id = ${nRole},
        department_id = ${nDept},
        location_id = ${nLoc},
        supervisor = ${nSup},
        is_verified = ${Boolean(is_verified)}
      WHERE id = ${userId}
      RETURNING id, email, name, surname, role_id, department_id, location_id, supervisor, is_verified
    `;

    if (!updated) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({ result: updated });
  } catch (e) {
    console.error("updateUserAdmin ERROR:", e);

    if (e.code === "23505") {
      return res.status(409).json({ message: "Email already exists" });
    }

    return res.status(500).json({ message: "Internal server error" });
  }
};

const forceLogoutUserAdmin = async (req, res) => {
  try {
    const userId = Number(req.params?.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    const [existing] = await sql`
      SELECT id
      FROM users
      WHERE id = ${userId}
    `;

    if (!existing) {
      return res.status(404).json({ message: "User not found" });
    }

    await sql`
      UPDATE users
      SET refresh_token = NULL
      WHERE id = ${userId}
    `;

    return res.json({
      message: "User has been force logged out",
      result: { id: userId },
    });
  } catch (error) {
    console.error("forceLogoutUserAdmin ERROR:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
    getUserDetails,
    updateUserRole,
    updateUserBranch,
    deleteUser,
    getUsers,
    getProfileInfo,
    updateProfileInfo,
    updateCurrentUserPassword,
    getManagers,
    getBranches,
    getLocations,
    updateUserAdmin,
    forceLogoutUserAdmin
};
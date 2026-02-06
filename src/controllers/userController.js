const express = require('express');
const sql = require('./db.js');
const bcrypt = require('bcrypt');

const getUserDetails = async (req, res) => {
    try {
        const userId = req.params?.id;
        if (!userId) return res.status(400).json({ message: 'User ID is required' });

        const user = await sql`
            SELECT 
                u.id,
                u.name,
                u.surname,
                u.email,
                u.role_id,
                l.name AS location_name,
                d.name AS department_name,
                s.name AS supervisor_name,
                s.surname AS supervisor_surname
            FROM users u
            LEFT JOIN users s ON s.id = u.supervisor
            LEFT JOIN location l ON l.id = u.location_id
            LEFT JOIN departments d ON d.id = u.department_id
            WHERE u.id = ${userId};
        `;

        if (user.length === 0) return res.status(404).json({ message: 'User not found' });

        return res.json(user[0]);
    } catch (error) {
        return res.status(500).json({ message: 'Internal server error' });
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
            SELECT id, name, surname, email, role_id
            FROM users
            ORDER BY surname ASC
        `;

        return res.json({ message: 'Success', result: rows });
    } catch (error) {
        return res.status(500).json({ message: 'Internal server error' });
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

const editCommissionMembers = async (req, res) => {
  try {
    const { commission_id, idea_id, memberIds } = req.body;

    const commissionId = Number(commission_id);
    const ideaId = idea_id !== undefined ? Number(idea_id) : null;

    if (!Number.isInteger(commissionId)) {
      return res.status(400).json({ message: "commission_id is required and must be an integer" });
    }

    if (!Array.isArray(memberIds)) {
      return res.status(400).json({ message: "memberIds must be an array of user ids" });
    }

    const nextMemberIds = [...new Set(memberIds.map(Number))].filter(Number.isInteger);

    const result = await sql.begin(async (tx) => {
      if (ideaId !== null && Number.isInteger(ideaId)) {
        const check = await tx`
          SELECT id
          FROM commissions
          WHERE id = ${commissionId} AND idea_id = ${ideaId}
        `;
        if (check.length === 0) {
          throw Object.assign(new Error("Commission not found for given idea_id"), { status: 404 });
        }
      }

      const assignedUsers = await tx`
        SELECT user_id
        FROM commision_members
        WHERE commission_id = ${commissionId}
      `;

      const currentIds = assignedUsers.map(r => Number(r.user_id));
      const currentSet = new Set(currentIds);
      const nextSet = new Set(nextMemberIds);

      const toAdd = nextMemberIds.filter(id => !currentSet.has(id));
      const toRemove = currentIds.filter(id => !nextSet.has(id));

      if (toRemove.length > 0) {
        await tx`
          DELETE FROM commision_members
          WHERE commission_id = ${commissionId}
            AND user_id IN ${tx(toRemove)}
        `;
      }

      if (toAdd.length > 0) {
        const rowsToInsert = toAdd.map(uid => ({
          commission_id: commissionId,
          user_id: uid,
        }));

        await tx`
          INSERT INTO commision_members ${tx(rowsToInsert, "commission_id", "user_id")}
          ON CONFLICT DO NOTHING
        `;
      }

      const updated = await tx`
        SELECT user_id
        FROM commision_members
        WHERE commission_id = ${commissionId}
        ORDER BY user_id
      `;

      return {
        added: toAdd,
        removed: toRemove,
        members: updated.map(r => Number(r.user_id)),
      };
    });

    return res.status(200).json({
      message: "Commission members updated",
      ...result,
    });

  } catch (err) {
    console.error(err);

    if (err?.status) {
      return res.status(err.status).json({ message: err.message });
    }

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
    getLocations
};
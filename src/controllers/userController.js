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

        if (profile.length === 0)
            return res.status(404).json({ message: "User not found" });

        return res.json({ message: "Success", result: profile });
    } catch (error) {
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

        if (supervisor) {
            const [sup] = await sql`SELECT id FROM users WHERE id = ${supervisor}`;
            if (!sup) return res.status(400).json({ message: "Supervisor does not exist" });
            if (Number(supervisor) === Number(userId))
                return res.status(400).json({ message: "User cannot be their own supervisor" });
        }

        await sql`
            UPDATE users SET
                name = ${name},
                surname = ${surname},
                email = ${email},
                department_id = ${department_id},
                location_id = ${location_id},
                supervisor = ${supervisor}
            WHERE id = ${userId}
        `;

        return res.json({ message: "Profile updated successfully" });
    } catch (error) {
        return res.status(500).json({ message: "Internal server error" });
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
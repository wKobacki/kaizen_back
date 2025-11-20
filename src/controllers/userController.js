const express = require('express');
const sql =require('./db.js');

const getUserDetails = async (req, res) => {
    try {
        const userId = req.params?.id;
        if (!userId) return res.status(400).json({ message: 'User ID is required' });

        const user = await sql`
            SELECT id, email, role, name, surname, branch, "isVerified", "isBlocked" 
            FROM users
            WHERE id = ${userId}
        `;

        if (!user) return res.status(404).json({ message: 'User not found' });

        return res.json(user[0]);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const updateUserRole = async (req, res) => {
    try {
        const userId = req.params?.id;
        if(!userId) return res.status(400).json({ message: 'User ID is required' });

        const { role } = req.body;

        if(!role ) 
            return res.status(400).json({message: 'Role is required'});

        const updatedUser = await sql`
            UPDATE users
            SET role = ${role}
            WHERE id = ${userId}
            RETURNING id
        `;

        if (updatedUser.length === 0) return res.status(404).json({ message: 'User not found' });

        return res.status(200).json({message: "User role updated successfully"});
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Internal server error' });
    }
}

const updateUserBranch = async (req, res) => {
    try {
        const userId = req.params?.id;
        if (!userId) {
            return res.status(400).json({ message: 'User ID is required' });
        }

        const { branch } = req.body;
        if (!branch) {
            return res.status(400).json({ message: 'Branch is required' });
        }

        const updatedUser = await sql`
            UPDATE users
            SET branch = ${branch}
            WHERE id = ${userId}
            RETURNING id
        `;

        if (updatedUser.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        return res.status(200).json({message: "User branch updated successfully"});

    } catch (error) {
        console.error('updateUserBranch error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const updateUserBlockStatus = async (req, res) => {
    try {
        const userId = req.params?.id;
        if (!userId) return res.status(400).json({ message: 'User ID is required' });

        const { isBlocked } = req.body;
        if (!isBlocked) return res.status(400).json({ message: 'isBlocked status is required' });

        const updatedUser = await sql`
            UPDATE users
            SET "isBlocked" = ${isBlocked}
            WHERE id = ${userId}
            RETURNING id
        `;

        if (updatedUser.length === 0) return res.status(404).json({ message: 'User not found' });

        return res.status(200).json({message: "User block status updated successfully"});
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Internal server error' });
    }
}

const deleteUser = async (req, res) => {
    try {
        const userId = req.params?.id;
        if (!userId) return res.status(400).json({ message: 'User ID is required' });

        const user = await sql`
            DELETE FROM users
            WHERE id = ${userId}
            RETURNING id
            `;
        if(user.length === 0) return res.status(404).json({ message: 'User not found' });

        return res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Internal server error' });   
    }
}

module.exports = {
    getUserDetails,
    updateUserRole,
    updateUserBranch,
    updateUserBlockStatus,
    deleteUser
};
const express = require('express');
const sql =require('./db.js');

const getUserDetails = async (req, res) => {
    try {
        const userId = req.params?.id;
        if (!userId) return res.status(400).json({ message: 'User ID is required' });

        const user = await sql`
            SELECT id, email, role, name, surname, branch, isVerified, isBlocked 
            FROM users
            WHERE id = ${userId}
        `;

        if (user.length === 0) return res.status(404).json({ message: 'User not found' });

        return res.json(user[0]);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Błąd serwera' });
    }
};

const updateUserDetails = async (req, res) => {
    try {
        const userId = req.params?.id;
        if(!userId) return res.status(400).json({ message: 'User ID is required' });

        const { isBlocked, branch, role } = req.body;

        if( !isBlocked && !branch && !role ) 
            return res.status(400).json({message: 'At least one field is empty'});

        let query = 'UPDATE users SET ';
        let params = [];
        let setFields = [];

        if (brnach) {
            setFields.push(`branch = ${sql(brnach)}`);
        }

        if (role) {
            setFields.push(`role = ${sql(role)}`);
        }

        if (isBloceked) {
            setFields.push(`isBlocked = ${sql(isBloceked)}`);
        }

        query += setFields.join(', ') + ` WHERE id = ${sql(userId)} RETURNING id, username, email, avatar_filename`;

        const updatedUser = await sql`${sql(query)}`;

        return res.json(updatedUser[0]);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Błąd serwera' });
    }
}

const deleteUser = async (req, res) => {
    try {
        const userId = req.params?.id;
        if (!userId) return res.status(400).json({ message: 'User ID is required' });

        const user = await sql`
            DELETE FROM "Users"
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
    updateUserDetails,
    deleteUser
};
const express = require('express');
const sql =require('./db.js');
const bcrypt = require('bcrypt');

const getUserDetails = async (req, res) => {
    try {
        const userId = req.params?.id;
        if (!userId) return res.status(400).json({ message: 'User ID is required' });

        const user = await sql`
            SELECT id, email, role, name, surname, branch, "is_verified" 
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

const deleteUser = async (req, res) => {
    try {
        const userId = req.params?.id;
        if (!userId) return res.status(400).json({ message: 'User ID is required' });

        const targetUser = await sql`
            SELECT * 
            FROM users
            WHERE id = ${userId}
        `;
        
        if(!targetUser) return res.status(400).json({message: 'User not found'});

        await sql`
            DELETE FROM ideas
            WHERE user_id = ${userId}
        `;

        const user = await sql`
                DELETE FROM users
                WHERE id = ${userId}
                RETURNING id
            `;

        if(!user) return res.status(400).json({ message: 'User not found' });

        return res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Internal server error' });   
    }
}

const getUsers = async (req, res) => {
    try {
        const evryUser = await sql`
            SELECT id, name, surname, email
            FROM users
        `;

        if(!evryUser) return res.status(403).json({message: 'Users not found'});

        return res.status(200).json({message: 'Success', result: evryUser});

    } catch (error) {
        console.error(error);
        return res.status(500).json({message: 'Internal server error'});
    }
}

const getProfileInfo = async (req, res) => {
    const userId = req.params?.id;
    if (!userId) return res.status(400).json({ message: "User id is required" });

    try {
        const profile = await sql`
            SELECT 
                u.id, 
                u.name, 
                u.surname, 
                u.email, 
                u.branch, 
                u.supervisor,
                s.name AS supervisor_name,
                s.surname AS supervisor_surname
            FROM users u
            LEFT JOIN users s
                ON s.id = u.supervisor
            WHERE u.id = ${userId};
        `;

        if (!profile || profile.length === 0)
            return res.status(404).json({ message: "User not found" });

        return res.status(200).json({
            message: "Success",
            result: profile,
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

const updateProfileInfo = async (req, res) => {
    try {
        const userId = req.params?.id;
        if (!userId) return res.status(400).json({ message: "User ID is required" });

        const { name, surname, email, branch, supervisor } = req.body;

        const [existing] = await sql`
            SELECT id FROM users WHERE id = ${userId}
        `;

        if (!existing) {
            return res.status(404).json({ message: "User not found" });
        }

        if (supervisor) {
            const [supervisorUser] = await sql`
                SELECT id FROM users WHERE id = ${supervisor}
            `;

            if (!supervisorUser) {
                return res.status(400).json({ message: "Supervisor does not exist" });
            }

            if (Number(supervisor) === Number(userId)) {
                return res.status(400).json({ message: "User cannot be their own supervisor" });
            }
        }

        await sql`
            UPDATE users SET
                name = ${name},
                surname = ${surname},
                email = ${email},
                branch = ${branch},
                supervisor = ${supervisor || null}
            WHERE id = ${userId}
        `;

        return res.json({ message: "Profile updated successfully" });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

const updateCurrentUserPassword = async (req, res) => {
    try {
        const userId = req.user.id; 
        const { oldPassword, newPassword } = req.body;

        if (!oldPassword || !newPassword) {
            return res.status(400).json({ message: "Both old and new password are required" });
        }

        if(oldPassword === newPassword) return res.status(400).json({message: "new password can't be the same as the old one"});

        const [user] = await sql`
            SELECT password
            FROM users
            WHERE id = ${userId}
        `;

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const match = await bcrypt.compare(oldPassword, user.password);
        if (!match) {
            return res.status(401).json({ message: "Incorrect old password" });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await sql`
            UPDATE users
            SET password = ${hashedPassword}
            WHERE id = ${userId}
        `;

        return res.json({ message: "Password changed successfully" });

    } catch (err) {
        console.error("updateCurrentUserPassword error:", err);
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
    updateCurrentUserPassword
};
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sql = require('./db');
const { ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET } = require('../../config');

const handleLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }
        const foundUser = await sql`
            SELECT id, email, password
            FROM users
            WHERE email = ${email}
        `;

        if (foundUser.length === 0) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const user = foundUser[0];

        const match = await bcrypt.compare(password, user.password);

        if (!match) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const accessToken = jwt.sign(
            { email: user.email },
            ACCESS_TOKEN_SECRET,
            { expiresIn: '15m' }
        );

        const refreshToken = jwt.sign(
            { email: user.email },
            REFRESH_TOKEN_SECRET,
            { expiresIn: '1d' }
        );

        await sql`
            UPDATE user
            SET refresh_token = ${refreshToken}
            WHERE email = ${email}
        `;

        res.cookie('jwt', refreshToken, {
            httpOnly: true,
            secure: false,  // in prod true
            maxAge: 24 * 60 * 60 * 1000,
        });

        return res.json({
            uid: user.id,
            accessToken
        });

    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports = { handleLogin };
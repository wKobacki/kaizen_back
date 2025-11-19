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

        // szukamy użytkownika
        const foundUser = await sql`
            SELECT id, email, password
            FROM "Users"
            WHERE email = ${email}
        `;

        if (foundUser.length === 0) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const user = foundUser[0];

        // sprawdzenie hasła
        const match = await bcrypt.compare(password, user.password);

        if (!match) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        // tworzymy tokeny
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

        // zapis refresha w DB
        await sql`
            UPDATE "Users"
            SET refresh_token = ${refreshToken}
            WHERE email = ${email}
        `;

        // ustawiamy cookie
        res.cookie('jwt', refreshToken, {
            httpOnly: true,
            secure: false,  // ustawiasz na true w produkcji (HTTPS)
            maxAge: 24 * 60 * 60 * 1000,
        });

        // zwracamy odpowiedź
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
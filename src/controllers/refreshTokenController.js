const jwt = require('jsonwebtoken');
const sql = require('./db');
const { REFRESH_TOKEN_SECRET, ACCESS_TOKEN_SECRET } = require('../../config');

const handleRefreshToken = async (req, res) => {
    try {
        const cookies = req.cookies;
        if (!cookies?.jwt) return res.sendStatus(401);

        const refreshToken = cookies.jwt;

        const foundUser = await sql`
            SELECT id, email, role, refresh_token
            FROM users
            WHERE refresh_token = ${refreshToken}
        `;

        if (foundUser.length === 0) return res.sendStatus(403);

        jwt.verify(refreshToken, REFRESH_TOKEN_SECRET, (err, decoded) => {
            if (err || foundUser[0].email !== decoded.email) return res.sendStatus(403);

            const accessToken = jwt.sign(
                {
                    id: decoded.id,
                    email: decoded.email,
                    role: decoded.role
                },
                ACCESS_TOKEN_SECRET,
                { expiresIn: '15m' }
            );

            res.json({ 
                uid: foundUser[0].id,
                accessToken 
            });
        });
    } catch (err) {
        console.error(err);
        return res.sendStatus(500);
    }
};

module.exports = { handleRefreshToken };

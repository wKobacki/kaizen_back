const jwt = require('jsonwebtoken');
const sql = require('./db');
const { REFRESH_TOKEN_SECRET, ACCESS_TOKEN_SECRET } = require('../../config');

const handleRefreshToken = async (req, res) => {
    try {
        const cookies = req.cookies;
        if (!cookies?.jwt) return res.sendStatus(401); 

        const refreshToken = cookies.jwt;
        const foundUser = await sql`
            SELECT id, email, refresh_token
            FROM users
            WHERE refresh_token = ${refreshToken}
            `;
        
        if (!foundUser) return res.sendStatus(403);

        jwt.verify(refreshToken, REFRESH_TOKEN_SECRET, (err, decoded) => {
            if (err || foundUser[0].email !== decoded.email) return res.sendStatus(403);

            const accesToken = jwt.sign(
                { email: decoded.email },
                ACCESS_TOKEN_SECRET,
                { expiresIn: '15s' }
            );
            res.json({ uid: foundUser[0].id, accessToken: accesToken });
        });
    } catch (err) {
        return res.sendStatus(500);
    }
};

module.exports = { handleRefreshToken };
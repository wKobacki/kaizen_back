const sql = require('./db');

const handleLogout = async (req, res) => {
    try {
        const cookies = req.cookies

        if (!cookies) return res.sendStatus(204);

        const refreshToken = cookies.jwt;

        const foundUser = await sql`
            SELECT refresh_token
            FROM users
            WHERE refresh_token = ${refreshToken}
        `;

        if(!foundUser) {
            res.clearCookie('jwt', {secure: true});
            return res.status(204);
        }

        await sql`
            SELECT refresh_token
            FROM users
            WHERE refresh_token = ${refreshToken}
        `;

        res.clearCookie('jwt', {secure: true, httpOnly: true});
        return res.sendStatus(204);

    } catch (err) {
        console.error(err);
        return res.status(500).json({message: 'Internal Server Error'})
    }
}

module.exports = { handleLogout };
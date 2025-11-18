const sql = require('./db');

const verifyUser = async (req, res, next) => {
    try {
        const { email, code } = req.body;

        if (!email || !code) return res.status(400).json({ message: 'Email and verification code are required' });

        const users = await sql`
            SELECT id, isVerified, verificationCode
            FROM "Users"
            WHERE email = ${email}
        `;

        if (user.length === 0) return res.status(404).json({ message: 'User not found' });

        const user = users[0];

        if (user.verifyUserd) return res.status(400).json({ message: 'User is already verified' });

        if (user.verificationCode === code) {
            await sql`
                UPDATE "Users"
                SET isVerified = true, verificationCode = NULL
                WHERE id = ${user.id}
            `;
            return res.status(200).json({ message: 'User verified successfully' });
        } else {
            return res.status(400).json({ message: 'Invalid verification code' });
        }
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
};

module.exports = { verifyUser };
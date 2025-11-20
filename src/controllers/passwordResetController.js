const sql = require('./db');
const sendPasswordResetEmail = require('./mailerController');
const bcrypt = require("bcrypt");

const generateVerificationCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

const handlePasswordReset = async (req, res) => {
    const { email } = req.body;

    if (!email) return res.status(400).json({message: "Email Address required "});

    try {
        const result = await sql`
        SELECT email, name, surname
        FROM users
        WHERE email=${email}`;

        const user = result[0];

        if(!user) return res.status(400).json({message: "User not found"});

        const verificationCode = generateVerificationCode();

        await sql`
        UPDATE users
        SET verification_code = ${verificationCode}
        WHERE email = ${email}
        `;

        await sendPasswordResetEmail(email, user.name, user.surname, verificationCode);

        console.log("Verification code has been sent");
        return res.status(200).json({message: 'User has been added sucesfully'})
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
}

const restorePassword = async (req, res) => {
    const {verificationCode, newPassword} = req.body;

    if (!verificationCode || !newPassword) return res.status(400).json({message: "Verification code and new passwrod required"});

    try {
        const result = await sql`
        SELECT id
        FROM users
        WHERE verification_code = ${verificationCode}
        `;

        const user = result[0];

        if(!user) return res.status(400).json({message: 'Verification code has not beed found'});

        const hashedPassword = await bcrypt.hash(newPassword, 12);

        await sql`
        UPDATE users
        SET hashed_passwrod = ${hashedPassword}, verification_code= NULL
        `;

        return res.status(200).json({message: 'New passwrod has been set'})

    } catch(err) {
        console.error(err);
        return res.status(500).json({message: 'Internal Server Error'});
    }
}

const resetPassword =  async (req, res) => {
    const {userId, oldPassword, newPassword} = req.body;

    if(!userId || !oldPassword || !newPassword) return res.status(400).json({message: 'User ID, old password and new password are required'});

    try {
        const result = await sql`
        SELECT * 
        FROM users
        WHERE id = ${userId}
        `;

        const user = result[0];

        if(!user) return res.status(404).json({message: 'User not found'});

        const match = await bcrypt.compare(oldPassword, user.hashed_password);

        if(!match) return res.status(401).json({message: 'Password does not match'});

        const hashedPassword = await bcrypt.hash(newPassword, 12);

        await sql`
        UPDATE users
        SET hashed_password = ${hashedPassword}
        WHERE id = ${userId}`

        return res.status(200).json({message: 'Password has been updated successfully'});
    } catch(err) {
        console.err(err);
        return res.status(500).json({message: 'Internal Server Error'});
    }
}

module.exports = {handlePasswordReset, restorePassword, resetPassword};
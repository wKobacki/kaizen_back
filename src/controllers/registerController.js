const experss = require('express');
const sql = require('./db');
const bcrypt = require('bcrypt');

const generateVerificationCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

const handleNewUser = async (req, res) => {
    try {
        const { email, password, name, surname, location } = req.body;

        if (!email || !password || !name || !surname || !location) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        if (password.length < 8 || password.length > 48) return res.status(400).json({ message: 'Password must be between 8 and 48 characters' });

        if (email.length > 255) return res.status(400).json({message: "too logn email address"});

        if (name.length > 200) return res.status(400).json({message: "too long name"});

        if (surname.length > 200) return res.status(400).json({message: "too long surname"});

        if (location!=='Warszawa' || location!=='Skierniewice' || location!=='Lyszkowice' || location!=='Rakoniewice' || location!=='Gliwice' || location!=='Teresin' || location!=='Nowy Tomysl') return res.status(400).json({message: "invalid location"});

        const existingUser = await sql`
            SELECT id from users
            WHERE email = ${email}
        `
        if (existingUser.length > 0) return res.status(409).json({ message: 'User with this email already exists' });

        const hashedPassword = await bcrypt.hash(password, 14);

        const verificationCode = generateVerificationCode();

        console.log(verificationCode);// 

        const result = await sql`
            INSERT INTO users (email, password, role, name, surname, location, isVerified, isBlocked, verificationCode)
            VALUES (${email}, ${hashedPassword}, 'User', ${name}, ${surname}, ${location}, false, false, ${verificationCode})
            RETURNING id
        `;

        const userId = result[0].id;

        //await sendVerificationEmail(email, name, surname, verificationCode); // Placeholder for email sending function
        console.log('Verification email sent to: ' + email);

        return res.status(201).json({ message: 'User registered successfully. Please check your email for the verification code.', userId });
    } catch (err) {
        console.error(err);
        return res.status(500).json({message: "Internal Server Error" });
    }
};

module.exports = handleNewUser;
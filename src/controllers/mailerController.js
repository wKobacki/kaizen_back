const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
service: process.env.EMAIL_SERVICE,
auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
    }
});

const sendVerificationEmail = async (email, name, surname, verificationCode) => {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Account Verification',
        text: `Hello ${name} ${surname},\n\nYour verification code is: ${verificationCode}\n\nThank you!`
    }

    try {
        await transporter.sendMail(mailOptions);
        console.log('Verification email sent');
    } catch(err) {
        console.error(err);
        throw new Error('Error sending verification email');
    }
}

const sendPasswordResetEmail = async (email, name, surname, verificationCode) => {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Password Reset Request',
        text: `Hello ${name} ${surname},\n\nYour password reset verification code is: ${verificationCode}\n\nThank you!`
    }

    try {
        await transporter.sendMail(mailOptions);
        console.log('Password reset email sent');
    } catch(err) {
        console.error(err);
        throw new Error('Error sending password reset email');
    }}

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
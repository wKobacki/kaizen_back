const sql = require("./db");
const { sendVerificationEmail } = require("./mailerController");

const generateVerificationCode = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

const verifyUser = async (req, res) => {
  try {
    const userId = req.user?.id;
    const code = String(req.body?.code || "").trim();

    if (!userId) return res.sendStatus(401);
    if (!code) return res.status(400).json({ message: "Verification code is required" });

    const [u] = await sql`
      SELECT id, is_verified, verification_code, verification_code_expires_at
      FROM users
      WHERE id = ${userId}
      LIMIT 1
    `;

    if (!u) return res.sendStatus(401);

    if (u.is_verified) {
      return res.status(200).json({
        message: "User already verified",
        user: { is_verified: true },
      });
    }

    if (!u.verification_code || !u.verification_code_expires_at) {
      return res.status(400).json({ message: "No active verification code. Please resend." });
    }

    const now = new Date();
    const exp = new Date(u.verification_code_expires_at);
    if (now > exp) {
      return res.status(400).json({ message: "Verification code expired. Please resend." });
    }

    if (String(u.verification_code) !== code) {
      return res.status(400).json({ message: "Invalid verification code" });
    }

    await sql`
      UPDATE users
      SET is_verified = true,
          verification_code = NULL,
          verification_code_expires_at = NULL
      WHERE id = ${userId}
    `;

    return res.status(200).json({
      message: "User verified successfully",
      user: { is_verified: true },
    });
  } catch (err) {
    console.error("verifyUser ERROR:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

const resendVerification = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.sendStatus(401);

    const [u] = await sql`
      SELECT id, email, name, surname, is_verified
      FROM users
      WHERE id = ${userId}
      LIMIT 1
    `;
    if (!u) return res.sendStatus(401);

    if (u.is_verified) {
      return res.status(400).json({ message: "User is already verified" });
    }

    const newCode = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await sql`
      UPDATE users
      SET
        verification_code = ${newCode},
        verification_code_expires_at = ${expiresAt}
      WHERE id = ${userId}
    `;

    await sendVerificationEmail(u.email, u.name, u.surname, newCode);

    return res.status(200).json({ message: "Verification code resent" });
  } catch (err) {
    console.error("resendVerification ERROR:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports = { verifyUser, resendVerification };
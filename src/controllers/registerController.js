const sql = require("./db");
const bcrypt = require("bcrypt");
const { sendVerificationEmail } = require("./mailerController");

const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const handleNewUser = async (req, res) => {
  try {
    const { email, password, name, surname, location_id, department_id } = req.body;

    if (!email || !password || !name || !surname || !location_id || !department_id) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (password.length < 8 || password.length > 48) {
      return res.status(400).json({ message: "Password must be between 8 and 48 characters" });
    }

    if (email.length > 255) return res.status(400).json({ message: "too long email address" });
    if (name.length > 200) return res.status(400).json({ message: "too long name" });
    if (surname.length > 200) return res.status(400).json({ message: "too long surname" });

    const locId = Number(location_id);
    const depId = Number(department_id);

    if (!Number.isInteger(locId) || locId <= 0) {
      return res.status(400).json({ message: "invalid location_id" });
    }
    if (!Number.isInteger(depId) || depId <= 0) {
      return res.status(400).json({ message: "invalid department_id" });
    }

    const loc = await sql`SELECT id FROM location WHERE id = ${locId} LIMIT 1`;
    if (loc.length === 0) return res.status(400).json({ message: "invalid location" });

    const dep = await sql`
      SELECT id, supervisor_user_id
      FROM departments
      WHERE id = ${depId}
      LIMIT 1
    `;
    if (dep.length === 0) return res.status(400).json({ message: "invalid department" });

    const supervisorId = Number(dep[0].supervisor_user_id);
    if (!Number.isInteger(supervisorId) || supervisorId <= 0) {
      return res.status(400).json({ message: "department has no supervisor assigned" });
    }

    const mgr = await sql`SELECT id FROM users WHERE id = ${supervisorId} LIMIT 1`;
    if (mgr.length === 0) {
      return res.status(400).json({ message: "invalid department supervisor" });
    }

    const existingUser = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existingUser.length > 0) {
      return res.status(409).json({ message: "User with this email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 14);
    const verificationCode = generateVerificationCode();

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const result = await sql`
      INSERT INTO users (
        email, password, role_id, name, surname,
        location_id, department_id,
        supervisor,
        is_verified,
        verification_code,
        verification_code_expires_at
      )
      VALUES (
        ${email}, ${hashedPassword}, 2, ${name}, ${surname},
        ${locId}, ${depId},
        ${supervisorId},
        false,
        ${verificationCode},
        ${expiresAt}
      )
      RETURNING id
    `;

    const userId = result?.[0]?.id;

    await sendVerificationEmail(email, name, surname, verificationCode);

    return res.status(201).json({
      message: "User registered successfully. Please check your email for the verification code.",
      userId,
      is_verified: false,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports = handleNewUser;
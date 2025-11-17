const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const nodemailer = require('nodemailer');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT;

const db = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 5432,
});

db.connect()
    .then(() => console.log('✅ Połączono z bazą danych PostgreSQL'))
    .catch((err) => console.error('❌ Błąd połączenia z bazą danych:', err));

app.use(cors({
    origin: ['http://localhost', 'http://localhost:3000'],
    credentials: true
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

function parseImagesField(imagesField) {
    if (!imagesField) return [];
    if (Array.isArray(imagesField)) return imagesField;
    if (typeof imagesField === 'string') {
        if (imagesField.startsWith('[')) {
            try {
                const parsed = JSON.parse(imagesField);
                if (Array.isArray(parsed)) {
                    return parsed;
                } else if (typeof parsed === 'string') {
                    return [parsed];
                }
            } catch (e) {
                console.error('Błąd podczas parsowania JSON w images:', e);
            }
        }
        if (imagesField.startsWith('/uploads/')) {
            return [imagesField];
        }
    }
    return [];
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`);
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Niedozwolony typ pliku. Dozwolone są tylko obrazy w formacie jpg i png.'));
        }
    }
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        rejectUnauthorized: false
    }
});

function authenticateUser(req, res, next) {
    const userEmail = req.headers['x-user-email'];

    if (!userEmail) {
        return res.status(401).json({ message: 'Brak uwierzytelnienia' });
    }

    db.query('SELECT * FROM "Users" WHERE email = $1', [userEmail], (err, result) => {
        if (err) {
            console.error('Błąd podczas sprawdzania użytkownika:', err);
            return res.status(500).json({ message: 'Błąd serwera przy uwierzytelnieniu' });
        }

        if (result.rows.length === 0) {
            console.warn('Nie znaleziono użytkownika:', userEmail);
            return res.status(403).json({ message: 'Brak dostępu' });
        }

        req.user = result.rows[0]; 
        next();
    });
}

function authenticateAdmin(req, res, next) {
    const userEmail = req.headers['x-user-email'];

    if (!userEmail) {
        return res.status(401).json({ message: 'Brak uwierzytelnienia' });
    }

    db.query('SELECT * FROM "Users" WHERE email = $1', [userEmail], (err, result) => {
        if (err || result.rows.length === 0) {
            return res.status(403).json({ message: 'Brak dostępu' });
        }

        const user = result.rows[0];

        if (user.role !== 'admin' && user.role !== 'manager') {
            return res.status(403).json({ message: 'Brak uprawnień' });
        }

        req.user = user;
        next();
    });
}

app.post('/register',
    [
        body('email').isEmail().withMessage('Nieprawidłowy adres e-mail'),
        body('password').isLength({ min: 6 }).withMessage('Hasło musi mieć co najmniej 6 znaków'),
        body('name').notEmpty().withMessage('Imię jest wymagane'),
        body('surname').notEmpty().withMessage('Nazwisko jest wymagane'),
        body('branch').notEmpty().withMessage('Oddział jest wymagany'),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ message: 'Błędne dane wejściowe', errors: errors.array() });
        }

        const { email, password, name, surname, branch } = req.body;

        try {
            const [existingUser] = await db.promise().query(
                'SELECT * FROM users WHERE email = ?',
                [email]
            );

            if (existingUser.length > 0) {
                return res.status(400).json({ message: 'E-mail jest już zarejestrowany.' });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
            const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h

            await db.promise().query(
                'INSERT INTO users (email, password, role, name, surname, branch, isVerified, isBlocked) VALUES (?, ?, "user", ?, ?, ?, false, false)',
                [email, hashedPassword, name, surname, branch]
            );

            await db.promise().query(
                'INSERT INTO verification_codes (email, code, expiresAt) VALUES (?, ?, ?)',
                [email, verificationCode, expiresAt]
            );

            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS,
                },
                tls: {
                    rejectUnauthorized: false
                }
            });

            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: 'Zweryfikuj swój adres e-mail',
                text: `Twój kod weryfikacyjny to: ${verificationCode}. Kod jest ważny przez 1 godzinę.`
            };

            transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.error('Błąd email:', error);
                    return res.status(500).json({ message: 'Błąd podczas wysyłania e-maila weryfikacyjnego.' });
                }
                return res.status(201).json({ message: 'Rejestracja zakończona. Sprawdź e-mail, aby się zweryfikować.' });
            });

        } catch (err) {
            console.error('Błąd rejestracji:', err);
            return res.status(500).json({ message: 'Błąd serwera podczas rejestracji.' });
        }
    });

app.post('/verify-email',
    [
        body('email').isEmail().withMessage('Nieprawidłowy adres e-mail'),
        body('code').isLength({ min: 6, max: 6 }).withMessage('Kod musi mieć 6 cyfr'),
    ],
    (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ message: 'Błędne dane wejściowe', errors: errors.array() });
        }

        const { email, code } = req.body;

        db.query('SELECT * FROM verification_codes WHERE email = ? AND code = ?', [email, code], (err, results) => {
            if (err) return res.status(500).json({ message: 'Błąd bazy danych' });
            if (results.length === 0) return res.status(400).json({ message: 'Nieprawidłowy kod weryfikacyjny lub kod wygasł' });

            const { expiresAt } = results[0];
            if (new Date() > expiresAt) {
                db.query('DELETE FROM verification_codes WHERE email = ?', [email]);
                return res.status(400).json({ message: 'Kod weryfikacyjny wygasł.' });
            }

            db.query('UPDATE users SET isVerified = true WHERE email = ?', [email], (err) => {
                if (err) return res.status(500).json({ message: 'Błąd bazy danych' });
                db.query('DELETE FROM verification_codes WHERE email = ?', [email]);
                res.status(200).json({ message: 'E-mail zweryfikowany pomyślnie.' });
            });
        });
    });

app.post('/verify-reset-code', [
    body('email').isEmail().withMessage('Nieprawidłowy adres e-mail'),
    body('code').isLength({ min: 6, max: 6 }).withMessage('Kod musi mieć 6 cyfr'),
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Błędne dane wejściowe', errors: errors.array() });
    }

    const { email, code } = req.body;

    db.query('SELECT * FROM reset_tokens WHERE email = ? AND code = ?', [email, code], (err, results) => {
        if (err || results.length === 0) {
            return res.status(400).json({ success: false, message: 'Nieprawidłowy kod.' });
        }

        const token = results[0];
        if (new Date() > token.expiresAt) {
            db.query('DELETE FROM reset_tokens WHERE email = ?', [email]);
            return res.status(400).json({ success: false, message: 'Kod wygasł.' });
        }

        return res.status(200).json({ success: true, message: 'Kod poprawny' });
    });
});

app.post('/resend-verification-code',
    [
        body('email').isEmail().withMessage('Nieprawidłowy adres e-mail'),
    ],
    (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ message: 'Błędne dane wejściowe', errors: errors.array() });
        }

        const { email } = req.body;

        db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
            if (err) return res.status(500).json({ message: 'Błąd bazy danych' });
            if (results.length === 0) return res.status(404).json({ message: 'Użytkownik nie znaleziony.' });

            const user = results[0];

            if (user.isVerified) {
                return res.status(400).json({ message: 'Użytkownik jest już zweryfikowany.' });
            }

            const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
            const expiresAt = new Date(Date.now() + 60 * 60 * 1000); 

            db.query('INSERT INTO verification_codes (email, code, expiresAt) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE code = ?, expiresAt = ?',
                [email, verificationCode, expiresAt, verificationCode, expiresAt], (err) => {
                    if (err) return res.status(500).json({ message: 'Błąd bazy danych podczas generowania kodu' });

                    const mailOptions = {
                        from: process.env.EMAIL_USER,
                        to: email,
                        subject: 'Ponowne wysłanie kodu weryfikacyjnego',
                        text: `Twój nowy kod weryfikacyjny to: ${verificationCode}. Kod jest ważny przez 1 godzinę.`
                    };

                    transporter.sendMail(mailOptions, (error, info) => {
                        if (error) return res.status(500).json({ message: 'Błąd podczas wysyłania e-maila weryfikacyjnego.' });
                        res.status(200).json({ message: 'Kod weryfikacyjny został ponownie wysłany na Twój adres e-mail.' });
                    });
                });
        });
    });

app.post('/login',
  [
    body('email').isEmail().withMessage('Nieprawidłowy adres e-mail'),
    body('password').notEmpty().withMessage('Hasło jest wymagane'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Błędne dane wejściowe', errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
      const result = await db.query('SELECT * FROM "Users" WHERE email = $1', [email]);

      if (result.rows.length === 0) {
        return res.status(401).json({ message: 'Nieprawidłowy e-mail lub hasło' });
      }

      const user = result.rows[0];
      const passwordMatch = await bcrypt.compare(password, user.password);

      if (!passwordMatch) {
        return res.status(401).json({ message: 'Nieprawidłowy e-mail lub hasło' });
      }

      if (!user.isVerified) {
        return res.status(403).json({ message: 'Proszę zweryfikować adres e-mail, aby aktywować konto.' });
      }

      res.status(200).json({
        message: 'Logowanie zakończone sukcesem',
        user: {
          email: user.email,
          role: user.role,
          branch: user.branch,
        },
      });
    } catch (err) {
      console.error('Błąd podczas logowania:', err);
      res.status(500).json({ message: 'Błąd serwera' });
    }
  }
);

app.post('/forgot-password',
    [
        body('email').isEmail().withMessage('Nieprawidłowy adres e-mail'),
    ],
    (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ message: 'Błędne dane wejściowe', errors: errors.array() });
        }

        const { email } = req.body;

        db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
            if (err || results.length === 0) return res.status(404).json({ message: 'Użytkownik nie znaleziony.' });

            const code = Math.floor(100000 + Math.random() * 900000);
            const expiresAt = new Date(Date.now() + 3600000); 

            db.query('INSERT INTO reset_tokens (email, code, expiresAt) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE code = ?, expiresAt = ?',
                [email, code, expiresAt, code, expiresAt], (err) => {
                    if (err) return res.status(500).json({ message: 'Błąd bazy danych' });

                    const mailOptions = {
                        from: process.env.EMAIL_USER,
                        to: email,
                        subject: 'Kod resetu hasła',
                        text: `Twój kod do resetu hasła to: ${code}. Kod jest ważny przez 1 godzinę.`
                    };

                    transporter.sendMail(mailOptions, (error, info) => {
                        if (error) return res.status(500).json({ message: 'Błąd podczas wysyłania e-maila z kodem resetu hasła.' });
                        res.status(200).json({ success: true, message: 'Kod resetu hasła został wysłany na Twój adres e-mail.' });
                    });
                });
        });
    });

app.post('/reset-password',
    [
        body('email').isEmail().withMessage('Nieprawidłowy adres e-mail'),
        body('code').isLength({ min: 6, max: 6 }).withMessage('Kod musi mieć 6 cyfr'),
        body('newPassword').isLength({ min: 6 }).withMessage('Nowe hasło musi mieć co najmniej 6 znaków'),
    ],
    async (req, res) => {
        const { email, code, newPassword } = req.body;

        console.log('Dane wejściowe:', { email, code, newPassword }); 

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ message: 'Błędne dane wejściowe', errors: errors.array() });
        }

        db.query('SELECT * FROM reset_tokens WHERE email = ? AND code = ?', [email, code], async (err, results) => {
            if (err || results.length === 0) return res.status(400).json({ message: 'Błędny kod weryfikacyjny.' });

            const token = results[0];
            if (new Date() > token.expiresAt) {
                db.query('DELETE FROM reset_tokens WHERE email = ?', [email]);
                return res.status(400).json({ message: 'Kod wygasł. Proszę spróbować ponownie.' });
            }

            const hashedPassword = await bcrypt.hash(newPassword, 10);

            db.query('UPDATE users SET password = ? WHERE email = ?', [hashedPassword, email], (err) => {
                if (err) return res.status(500).json({ message: 'Błąd bazy danych' });
                db.query('DELETE FROM reset_tokens WHERE email = ?', [email]);
                res.status(200).json({ message: 'Hasło zostało zresetowane pomyślnie.' });
            });
        });
    });

app.post('/submitIdea', upload.array('images', 3), authenticateUser,
    [
        body('title').notEmpty().withMessage('Tytuł jest wymagany'),
        body('department').notEmpty().withMessage('Dział jest wymagany'),
        body('description').notEmpty().withMessage('Opis jest wymagany'),
    ],
    (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            if (req.files) {
                req.files.forEach(file => {
                    fs.unlinkSync(file.path);
                });
            }
            return res.status(400).json({ message: 'Błędne dane wejściowe', errors: errors.array() });
        }

        const { title, department, description, solution } = req.body;
        const images = req.files ? req.files.map(file => `/uploads/${file.filename}`) : [];
        const userEmail = req.user.email;

        const user = req.user;
        if (user.isBlocked) {
            return res.status(403).json({ message: 'Nie masz uprawnień do dodawania pomysłów.' });
        }

        const sqlQuery = `
            INSERT INTO "General_ideas"
            (title, department, description, solution, images, status, votes, "createdAt", author_email, "isPublished", archived)
            VALUES ($1, $2, $3, $4, $5, 'pending', 0, NOW(), $6, FALSE, FALSE)
        `;

        const values = [
            title,
            department,
            description,
            solution,
            JSON.stringify(images),
            userEmail
        ];

        db.query(sqlQuery, values)
            .then(() => {
                res.status(201).json({ message: 'Pomysł dodany pomyślnie, oczekuje na akceptację.' });
            })
            .catch(err => {
                console.error('Błąd bazy danych podczas wstawiania pomysłu:', err);
                res.status(500).json({ message: 'Błąd bazy danych podczas wstawiania pomysłu' });
            });
    }
);

app.post('/submitProblem', upload.array('images', 3), authenticateUser,
    [
        body('title').notEmpty().withMessage('Tytuł jest wymagany'),
        body('department').notEmpty().withMessage('Dział jest wymagany'),
        body('description').notEmpty().withMessage('Opis jest wymagany'),
    ],
    (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            if (req.files) {
                req.files.forEach(file => {
                    fs.unlinkSync(file.path);
                });
            }
            return res.status(400).json({ message: 'Błędne dane wejściowe', errors: errors.array() });
        }

        const { title, department, description, solution, branch } = req.body;
        const images = req.files ? req.files.map(file => `/uploads/${file.filename}`) : [];
        const userEmail = req.user.email;

        const user = req.user;
        if (user.isBlocked) {
            return res.status(403).json({ message: 'Nie masz uprawnień do dodawania problemów.' });
        }

        const sqlQuery = `
            INSERT INTO "Local_ideas"
            (title, department, description, solution, images, branch, status, votes, crated_at, author_email, is_published, archived)
            VALUES ($1, $2, $3, $4, $5, $6, 'pending', 0, NOW(), $7, FALSE, FALSE)
        `;

        const values = [
            title,
            department,
            description,
            solution,
            JSON.stringify(images),
            branch || user.branch,
            userEmail
        ];

        db.query(sqlQuery, values)
            .then(() => {
                res.status(201).json({ message: 'Problem dodany pomyślnie, oczekuje na akceptację.' });
            })
            .catch(err => {
                console.error('Błąd bazy danych podczas wstawiania problemu:', err);
                res.status(500).json({ message: 'Błąd bazy danych podczas wstawiania problemu' });
            });
    }
);

app.get('/problems', async (req, res) => {
    const userEmail = req.headers['x-user-email'];
    const { status, archived, branch } = req.query;

    try {
        let sqlQuery = `
            SELECT * FROM "Local_ideas"
            WHERE (is_published = TRUE OR status = 'completed')
        `;
        const queryParams = [];
        let paramIndex = 1;

        // status=waiting,in_voting,completed
        if (status) {
            const statuses = status.split(',');
            sqlQuery += ` AND status = ANY($${paramIndex++})`;
            queryParams.push(statuses);
        }

        if (archived) {
            sqlQuery += ` AND archived = $${paramIndex++}`;
            queryParams.push(archived === 'true');
        }

        if (branch) {
            sqlQuery += ` AND branch = $${paramIndex++}`;
            queryParams.push(branch);
        }

        const problemsResult = await db.query(sqlQuery, queryParams);
        const problems = problemsResult.rows;

        if (problems.length === 0) {
            return res.json({ problems: [], userVoteCount: 0 });
        }

        const problemIds = problems.map(p => p.id);

        // pobieramy głosy użytkownika
        const voteQuery = `
            SELECT item_id 
            FROM user_votes 
            WHERE user_email = $1 AND item_type = 'problem' AND item_id = ANY($2)
        `;
        const voteResult = await db.query(voteQuery, [userEmail, problemIds]);

        const votedIds = voteResult.rows.map(v => v.item_id);

        const enriched = problems.map(p => ({
            ...p,
            images: parseImagesField(p.images),
            hasVoted: votedIds.includes(p.id)
        }));

        // Licznik głosów użytkownika
        const countQuery = `
            SELECT COUNT(*) AS voteCount
            FROM user_votes
            JOIN "Local_ideas" ON user_votes.item_id = "Local_ideas".id
            WHERE user_votes.user_email = $1 
            AND user_votes.item_type = 'problem'
            AND "Local_ideas".status = 'in_voting'
        `;
        const countResult = await db.query(countQuery, [userEmail]);

        res.json({
            problems: enriched,
            userVoteCount: Number(countResult.rows[0].votecount)
        });

    } catch (err) {
        console.error('Błąd serwera /problems:', err);
        res.status(500).json({ message: 'Błąd bazy danych' });
    }
});

app.get('/ideas', async (req, res) => {
    const userEmail = req.headers['x-user-email'];
    const { status, archived } = req.query;

    try {
        let sqlQuery = `SELECT * FROM "General_ideas" WHERE "isPublished" = true`;
        const queryParams = [];
        let paramIndex = 1;

        // ---- STATUS ----
        if (status !== undefined && status !== '') {
            const statuses = status
                .split(',')
                .map(s => s.trim()); // na wszelki wypadek obcinamy spacje

            // KLUCZOWA ZMIANA: rzutowanie placeholdera na text[]
            sqlQuery += ` AND status = ANY($${paramIndex}::text[])`;
            queryParams.push(statuses);
            paramIndex++;
        }

        // ---- ARCHIVED ----
        if (archived !== undefined) {
            sqlQuery += ` AND archived = $${paramIndex}::boolean`;
            queryParams.push(archived === 'true');
            paramIndex++;
        }

        // DODAJEMY LOGI, ŻEBY WIDZIEĆ, CO FAKTYCZNIE LECI DO BAZY
        console.log('[GET /ideas] SQL:', sqlQuery);
        console.log('[GET /ideas] params:', queryParams);

        const ideasResult = await db.query(sqlQuery, queryParams);
        const ideas = ideasResult.rows;

        if (ideas.length === 0) {
            return res.json({ ideas: [], userVoteCount: 0 });
        }

        const ideaIds = ideas.map(i => i.id);

        const voteQuery = `
            SELECT item_id 
            FROM user_votes 
            WHERE user_email = $1 AND item_type = 'idea' AND item_id = ANY($2)
        `;
        const voteResult = await db.query(voteQuery, [userEmail, ideaIds]);
        const votedIds = voteResult.rows.map(v => v.item_id);

        const enriched = ideas.map(i => ({
            ...i,
            images: parseImagesField(i.images),
            hasVoted: votedIds.includes(i.id)
        }));

        const countQuery = `
            SELECT COUNT(*) AS voteCount
            FROM user_votes
            JOIN "General_ideas" ON user_votes.item_id = "General_ideas".id
            WHERE user_votes.user_email = $1 
              AND user_votes.item_type = 'idea'
              AND "General_ideas".status = 'in_voting'
        `;
        const countResult = await db.query(countQuery, [userEmail]);

        res.json({
            ideas: enriched,
            userVoteCount: Number(countResult.rows[0].votecount)
        });

    } catch (err) {
        console.error('Błąd serwera /ideas:', err);
        res.status(500).json({ message: 'Błąd bazy danych' });
    }
});

app.post('/ideas/:id/vote', authenticateUser, (req, res) => {
    const ideaId = req.params.id;
    const userEmail = req.user.email;

    db.query('SELECT author_email, votes FROM ideas WHERE id = ?', [ideaId], (err, ideaResults) => {
        if (err) {
            console.error('Błąd SELECT idea:', err);
            return res.status(500).json({ success: false, message: 'Błąd podczas pobierania pomysłu' });
        }

        if (ideaResults.length === 0) {
            return res.status(404).json({ success: false, message: 'Idea not found' });
        }

        const idea = ideaResults[0];
        if (idea.author_email === userEmail) {
            return res.status(403).json({ success: false, message: 'Nie można oddać głosu na własny pomysł' });
        }

        const checkQuery = `
            SELECT * FROM user_votes 
            WHERE item_id = ? AND user_email = ? AND item_type = 'idea'
        `;

        db.query(checkQuery, [ideaId, userEmail], (err, voteResults) => {
            if (err) {
                console.error('Błąd SELECT vote:', err);
                return res.status(500).json({ success: false, message: 'Błąd podczas sprawdzania głosu' });
            }

            const voteExists = voteResults.length > 0;
            const newVoteCount = voteExists ? idea.votes - 1 : idea.votes + 1;

            const voteQuery = voteExists
                ? 'DELETE FROM user_votes WHERE item_id = ? AND user_email = ? AND item_type = "idea"'
                : 'INSERT INTO user_votes (item_id, user_email, item_type, created_at) VALUES (?, ?, "idea", NOW())';

            db.query(voteQuery, [ideaId, userEmail], (err) => {
                if (err) {
                    console.error('Błąd INSERT/DELETE vote:', err);
                    return res.status(500).json({ success: false, message: 'Błąd podczas aktualizacji głosu' });
                }

                db.query('UPDATE ideas SET votes = ? WHERE id = ?', [newVoteCount, ideaId], (err) => {
                    if (err) {
                        console.error('Błąd UPDATE votes:', err);
                        return res.status(500).json({ success: false, message: 'Błąd podczas zapisu liczby głosów' });
                    }

                    return res.status(200).json({
                        success: true,
                        message: 'Głosowanie zakończone sukcesem',
                        voted: !voteExists,
                        totalVotes: newVoteCount
                    });
                });
            });
        });
    });
});

app.post('/problems/:id/vote', authenticateUser, (req, res) => {
    const problemId = req.params.id;
    const userEmail = req.user.email;

    db.query('SELECT author_email, votes FROM problems WHERE id = ?', [problemId], (err, problemResults) => {
        if (err) {
            console.error('Błąd SELECT problem:', err);
            return res.status(500).json({ success: false, message: 'Błąd podczas pobierania problemu' });
        }

        if (problemResults.length === 0) {
            return res.status(404).json({ success: false, message: 'Problem not found' });
        }

        const problem = problemResults[0];
        if (problem.author_email === userEmail) {
            return res.status(403).json({ success: false, message: 'Nie można oddać głosu na własny problem' });
        }

        const checkQuery = `
            SELECT * FROM user_votes
            WHERE item_id = ? AND user_email = ? AND item_type = 'problem'
        `;

        db.query(checkQuery, [problemId, userEmail], (err, voteResults) => {
            if (err) {
                console.error('Błąd SELECT vote:', err);
                return res.status(500).json({ success: false, message: 'Błąd podczas sprawdzania głosu' });
            }

            const voteExists = voteResults.length > 0;
            const newVoteCount = voteExists ? problem.votes - 1 : problem.votes + 1;

            const voteQuery = voteExists
                ? `DELETE FROM user_votes WHERE item_id = ? AND user_email = ? AND item_type = 'problem'`
                : `INSERT INTO user_votes (item_id, user_email, item_type, created_at) VALUES (?, ?, 'problem', NOW())`;

            db.query(voteQuery, [problemId, userEmail], (err) => {
                if (err) {
                    console.error('Błąd INSERT/DELETE vote:', err);
                    return res.status(500).json({ success: false, message: 'Błąd podczas aktualizacji głosów' });
                }

                db.query('UPDATE problems SET votes = ? WHERE id = ?', [newVoteCount, problemId], (err) => {
                    if (err) {
                        console.error('Błąd UPDATE votes:', err);
                        return res.status(500).json({ success: false, message: 'Błąd podczas zapisu liczby głosów' });
                    }

                    return res.status(200).json({
                        success: true,
                        message: 'Głosowanie zakończone sukcesem',
                        voted: !voteExists,
                        totalVotes: newVoteCount
                    });
                });
            });
        });
    });
});

app.get('/admin/ideas', async (req, res) => {
    const { archived } = req.query;

    const archivedValue = archived === 'true';

    try {
        // GENERAL IDEAS
        const sqlGeneral = `
            SELECT *, 'idea' AS type 
            FROM "General_ideas"
            WHERE archived = $1
        `;
        const generalResult = await db.query(sqlGeneral, [archivedValue]);
        const generalIdeas = generalResult.rows.map(idea => ({
            ...idea,
            images: parseImagesField(idea.images)
        }));

        // LOCAL IDEAS (problems)
        const sqlLocal = `
            SELECT *, 'problem' AS type 
            FROM "Local_ideas"
            WHERE archived = $1
        `;
        const localResult = await db.query(sqlLocal, [archivedValue]);
        const problems = localResult.rows.map(problem => ({
            ...problem,
            images: parseImagesField(problem.images)
        }));

        res.json([...generalIdeas, ...problems]);

    } catch (err) {
        console.error("Database error:", err);
        res.status(500).json({ message: "Database error" });
    }
});

app.put('/admin/:type/:id/status', authenticateAdmin, async (req, res) => {
    const itemId = parseInt(req.params.id);
    const { status } = req.body;
    const type = req.params.type;

    const allowedTypes = ['ideas', 'problems'];
    const allowedStatuses = ['pending', 'in_voting', 'in_progress', 'completed', 'rejected'];

    if (!allowedTypes.includes(type)) {
        return res.status(400).json({ message: 'Nieprawidłowy typ elementu' });
    }

    if (!allowedStatuses.includes(status)) {
        return res.status(400).json({ message: 'Nieprawidłowy status elementu' });
    }

    const table =
        type === 'ideas'
            ? `"General_ideas"`
            : `"Local_ideas"`;

    const publishColumn =
        type === 'ideas'
            ? `"isPublished"`
            : `is_published`;

    const isPublished = ['in_voting', 'in_progress'].includes(status);

    try {
        const updateQuery = `
            UPDATE ${table}
            SET status = $1, ${publishColumn} = $2
            WHERE id = $3
        `;
        const result = await db.query(updateQuery, [status, isPublished, itemId]);

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Element nie istnieje" });
        }

        res.status(200).json({ message: 'Status elementu zaktualizowany' });
    } catch (err) {
        console.error("DB error:", err);
        res.status(500).json({ message: "Błąd bazy danych" });
    }
});

app.delete('/admin/problems/:id', authenticateAdmin, async (req, res) => {
    const problemId = parseInt(req.params.id, 10);

    if (isNaN(problemId) || problemId <= 0) {
        return res.status(400).json({ message: 'Invalid ID format' });
    }

    try {
        const result = await db.query(
            'DELETE FROM "Local_ideas" WHERE id = $1',
            [problemId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Problem not found' });
        }

        res.status(200).json({ message: 'Problem deleted successfully' });
    } catch (err) {
        console.error("Database error:", err);
        res.status(500).json({ message: 'Database error' });
    }
});

app.delete('/admin/ideas/:id', authenticateAdmin, async (req, res) => {
    const ideaId = parseInt(req.params.id, 10);

    if (isNaN(ideaId) || ideaId <= 0) {
        console.error(`Invalid ID format: ${req.params.id}`);
        return res.status(400).json({ message: 'Invalid ID format' });
    }

    try {
        const result = await db.query(
            'DELETE FROM "General_ideas" WHERE id = $1',
            [ideaId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Idea not found' });
        }

        console.log(`Idea with ID: ${ideaId} deleted successfully.`);
        res.status(200).json({ message: 'Idea deleted successfully' });

    } catch (err) {
        console.error("Database error:", err);
        res.status(500).json({ message: 'Database error' });
    }
});

app.put('/admin/:type/:id/archive', authenticateAdmin, async (req, res) => {
    const itemId = parseInt(req.params.id);
    const { archived } = req.body;
    const type = req.params.type;

    if (!['ideas', 'problems'].includes(type)) {
        return res.status(400).json({ message: 'Nieprawidłowy typ elementu' });
    }

    const table =
        type === 'ideas'
            ? `"General_ideas"`
            : `"Local_ideas"`;

    try {
        const result = await db.query(
            `UPDATE ${table} SET archived = $1 WHERE id = $2`,
            [archived === true, itemId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Element nie istnieje' });
        }

        res.json({ message: 'Archiwizacja elementu zakończona pomyślnie' });

    } catch (err) {
        console.error("Database error:", err);
        res.status(500).json({ message: 'Błąd bazy danych' });
    }
});

app.put('/admin/users/:id/role', authenticateAdmin, async (req, res) => {
    const { role } = req.body;
    const id = parseInt(req.params.id, 10);

    if (!role) {
        return res.status(400).json({ message: 'Brak nowej roli.' });
    }

    try {
        const result = await db.query(
            'UPDATE users SET role = $1 WHERE id = $2',
            [role, id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Użytkownik nie istnieje' });
        }

        res.status(200).json({ message: 'Rola zmieniona.' });

    } catch (err) {
        console.error('Błąd bazy danych przy zmianie roli:', err);
        res.status(500).json({ message: 'Błąd bazy danych.' });
    }
});

app.put('/admin/users/:id/branch', authenticateAdmin, async (req, res) => {
    const userId = parseInt(req.params.id);
    const { branch } = req.body;

    if (!branch) {
        return res.status(400).json({ message: 'Brak wartości "branch"' });
    }

    try {
        const result = await db.query(
            `UPDATE "Users" SET branch = $1 WHERE id = $2`,
            [branch, userId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Użytkownik nie istnieje' });
        }

        return res.status(200).json({ message: 'Oddział użytkownika został zmieniony', branch });

    } catch (err) {
        console.error('Błąd aktualizacji branch:', err);
        return res.status(500).json({ message: 'Błąd bazy danych' });
    }
});

app.put('/admin/users/:id/block', authenticateAdmin, async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    const { isBlocked } = req.body;

    try {
        await db.query(
            'UPDATE "Users" SET "isBlocked" = $1 WHERE id = $2',
            [isBlocked, userId]
        );

        res.status(200).json({
            message: isBlocked ? 'Użytkownik zablokowany' : 'Użytkownik odblokowany'
        });

    } catch (err) {
        console.error('Błąd bazy danych:', err);
        res.status(500).json({ message: 'Błąd bazy danych' });
    }
});

app.delete('/admin/users/:id', authenticateUser, async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    const client = await db.connect();

    try {
        // pobierz email użytkownika
        const userResult = await client.query(
            'SELECT email FROM users WHERE id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) {
            client.release();
            return res.status(404).json({ message: 'Nie znaleziono użytkownika' });
        }

        const userEmail = userResult.rows[0].email;

        // --- TRANSAKCJA ---
        await client.query('BEGIN');

        // 1. Usuń lajki komentarzy powiązane z komentarzami usera
        await client.query(
            `
            DELETE FROM comment_likes 
            WHERE comment_id IN (
                SELECT id FROM "Comments" WHERE author_email = $1
            )
            `,
            [userEmail]
        );

        // 2. Usuń inne lajki wykonane przez niego
        await client.query(
            'DELETE FROM comment_likes WHERE user_email = $1',
            [userEmail]
        );

        // 3. Usuń głosy użytkownika
        await client.query(
            'DELETE FROM user_votes WHERE user_email = $1',
            [userEmail]
        );

        // 4. Usuń komentarze
        await client.query(
            'DELETE FROM "Comments" WHERE author_email = $1',
            [userEmail]
        );

        // 5. Usuń pomysły
        await client.query(
            'DELETE FROM "Local_ideas" WHERE author_email = $1',
            [userEmail]
        );

        // 6. Usuń problemy
        await client.query(
            'DELETE FROM "General_ideas" WHERE author_email = $1',
            [userEmail]
        );

        // 7. Usuń użytkownika
        await client.query(
            'DELETE FROM "Users" WHERE id = $1',
            [userId]
        );

        // Commit
        await client.query('COMMIT');
        client.release();

        res.status(200).json({ message: 'Użytkownik i wszystkie dane powiązane zostały usunięte.' });

    } catch (err) {
        console.error("Błąd podczas usuwania użytkownika:", err);

        await client.query('ROLLBACK');
        client.release();

        res.status(500).json({ message: 'Błąd podczas usuwania danych użytkownika' });
    }
});

app.get('/admin/users/status', authenticateUser, async (req, res) => {
    const userEmail = req.user.email;

    try {
        const result = await db.query(
            'SELECT "isBlocked" FROM "Users" WHERE email = $1',
            [userEmail]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Użytkownik nie znaleziony.' });
        }

        res.status(200).json({ isBlocked: result.rows[0].isBlocked });

    } catch (err) {
        console.error("Błąd przy pobieraniu statusu użytkownika:", err);
        res.status(500).json({ message: 'Błąd bazy danych' });
    }
});

app.post('/changePassword', authenticateUser,
    [
        body('oldPassword').notEmpty().withMessage('Stare hasło jest wymagane'),
        body('newPassword').isLength({ min: 6 }).withMessage('Nowe hasło musi mieć co najmniej 6 znaków'),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ message: 'Błędne dane wejściowe', errors: errors.array() });
        }

        const { oldPassword, newPassword } = req.body;
        const email = req.user.email;

        db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
            if (err || results.length === 0) return res.status(404).json({ message: 'Użytkownik nie znaleziony' });

            const user = results[0];

            const passwordMatch = await bcrypt.compare(oldPassword, user.password);
            if (!passwordMatch) return res.status(401).json({ message: 'Stare hasło jest nieprawidłowe' });

            const hashedPassword = await bcrypt.hash(newPassword, 10);

            db.query('UPDATE users SET password = ? WHERE email = ?', [hashedPassword, email], (err) => {
                if (err) return res.status(500).json({ message: 'Błąd bazy danych' });
                res.status(200).json({ message: 'Hasło zostało zmienione pomyślnie' });
            });
        });
    });

app.get('/admin/users', authenticateAdmin, async (req, res) => {
    try {
        const result = await db.query(
            `SELECT id, email, role, name, surname, branch, "isVerified", "isBlocked" 
             FROM "Users"`
        );

        res.status(200).json(result.rows);

    } catch (err) {
        console.error("Błąd bazy danych:", err);
        res.status(500).json({ message: 'Błąd bazy danych' });
    }
});

app.post('/comments', (req, res) => {
    const { item_id, item_type, parent_id, content } = req.body;
    const author_email = req.headers['x-user-email']

    if (!item_id || !item_type || !content) {
        return res.status(400).json({ message: 'Brakuje wymaganych danych' });
    }

    const sql = 'INSERT INTO "Comments" (item_id, item_type, parent_id, author_email, content) VALUES (?, ?, ?, ?, ?)';
    db.query(sql, [item_id, item_type, parent_id || null, author_email, content], (err) => {
        if (err) return res.status(500).json({ message: 'Błąd bazy danych' });
        res.status(201).json({ message: 'Komentarz dodany pomyślnie' });
    });
});

app.get('/comments', (req, res) => {
    const { item_id, item_type } = req.query;
    const userEmail = req.headers['x-user-email'] || null;

    if (!item_id || !item_type) {
        return res.status(400).json({ message: 'Brakuje parametrów zapytania' });
    }

    const sql = `
        SELECT c.*, COUNT(l.comment_id) AS likes
        FROM "Comments" c
        LEFT JOIN comment_likes l ON c.id = l.comment_id
        WHERE c.item_id = ? AND c.item_type = ?
        GROUP BY c.id
        ORDER BY c.created_at ASC
    `;

    db.query(sql, [item_id, item_type], (err, results) => {
        if (err) {
            console.error('Błąd bazy danych (SELECT "Comments"):', err);
            return res.status(500).json({ message: 'Błąd bazy danych przy pobieraniu komentarzy' });
        }

        const commentIds = results.map(c => c.id);
        if (commentIds.length === 0) return res.json([]);

        const attachReplies = (comments, parentId = null) =>
            comments
                .filter(c => c.parent_id === parentId)
                .map(c => ({
                    ...c,
                    replies: attachReplies(comments, c.id)
                }));

        if (!userEmail) {
            const withDefaultFlags = results.map(c => ({
                ...c,
                likedByCurrentUser: false,
                likes: Number(c.likes) || 0
            }));

            return res.json(attachReplies(withDefaultFlags));
        }

        const likeQuery = `
            SELECT comment_id
            FROM comment_likes
            WHERE user_email = ? AND comment_id IN (?)
        `;

        db.query(likeQuery, [userEmail, commentIds], (err2, likedResults) => {
            if (err2) {
                console.error('Błąd przy sprawdzaniu polubień:', err2);
                return res.status(500).json({ message: 'Błąd przy sprawdzaniu polubień' });
            }

            const likedCommentIds = likedResults.map(row => row.comment_id);

            const resultsWithFlags = results.map(c => ({
                ...c,
                likedByCurrentUser: likedCommentIds.includes(c.id),
                likes: Number(c.likes) || 0
            }));

            return res.json(attachReplies(resultsWithFlags));
        });
    });
});

app.post('/comments/:id/like', authenticateUser, (req, res) => {
    const commentId = req.params.id;
    const userEmail = req.user.email;

    if (!userEmail) return res.status(401).json({ message: 'Brak e-maila użytkownika.' });

    const checkQuery = 'SELECT * FROM comment_likes WHERE comment_id = ? AND user_email = ?';
    db.query(checkQuery, [commentId, userEmail], (err, result) => {
        if (err) return res.status(500).json({ message: 'Błąd bazy danych.' });

        if (result.length > 0) {
            return res.status(400).json({ message: 'Już polubiłeś ten komentarz.' });
        }

        const insertQuery = 'INSERT INTO "Comment_likes (comment_id, user_email) VALUES (?, ?)';
        db.query(insertQuery, [commentId, userEmail], (err2) => {
            if (err2) return res.status(500).json({ message: 'Błąd zapisu polubienia.' });

            const updateLikes = 'UPDATE "Comments" SET likes = likes + 1 WHERE id = ?';
            db.query(updateLikes, [commentId], (err3) => {
                if (err3) return res.status(500).json({ message: 'Błąd aktualizacji liczby polubień.' });

                return res.status(200).json({ message: 'Polubiono komentarz.' });
            });
        });
    });
});

app.delete('/comments/:id/like', authenticateUser, (req, res) => {
    const commentId = req.params.id;
    const userEmail = req.user.email;

    if (!userEmail) return res.status(401).json({ message: 'Brak e-maila użytkownika.' });

    const deleteLike = 'DELETE FROM comment_likes WHERE comment_id = ? AND user_email = ?';
    db.query(deleteLike, [commentId, userEmail], (err, result) => {
        if (err) return res.status(500).json({ message: 'Błąd usuwania polubienia.' });

        if (result.affectedRows === 0) {
            return res.status(400).json({ message: 'Nie masz polubienia na tym komentarzu.' });
        }

        const updateLikes = 'UPDATE "Comments" SET likes = likes - 1 WHERE id = ? AND likes > 0';
        db.query(updateLikes, [commentId], (err2) => {
            if (err2) return res.status(500).json({ message: 'Błąd aktualizacji liczby polubień.' });

            return res.status(200).json({ message: 'Polubienie cofnięte.' });
        });
    });
});

app.delete('/admin/comments/:id', async (req, res) => {
    const commentId = parseInt(req.params.id, 10);
    const userEmail = req.headers['x-user-email'];

    if (!userEmail) {
        return res.status(401).json({ message: 'Brak adresu e-mail w nagłówku' });
    }

    if (isNaN(commentId) || commentId <= 0) {
        return res.status(400).json({ message: 'Nieprawidłowy format ID' });
    }

    db.query('SELECT role FROM users WHERE email = ?', [userEmail], async (err, results) => {
        if (err || results.length === 0) {
            return res.status(500).json({ message: 'Błąd bazy danych lub użytkownik nie istnieje' });
        }

        if (results[0].role !== 'admin') {
            return res.status(403).json({ message: 'Brak uprawnień administratora' });
        }

        const getAllChildCommentIds = (allComments, parentId) => {
            let ids = [parentId];
            const stack = [parentId];

            while (stack.length > 0) {
                const currentId = stack.pop();
                const children = allComments.filter(c => c.parent_id === currentId);
                for (const child of children) {
                    ids.push(child.id);
                    stack.push(child.id);
                }
            }

            return ids;
        };

        db.query('SELECT id, parent_id FROM "Comments"', (err2, allComments) => {
            if (err2) {
                console.error("Błąd przy pobieraniu komentarzy:", err2);
                return res.status(500).json({ message: 'Błąd przy pobieraniu komentarzy' });
            }

            const idsToDelete = getAllChildCommentIds(allComments, commentId);
            const placeholders = idsToDelete.map(() => '?').join(', ');

            db.query(`DELETE FROM comment_likes WHERE comment_id IN (${placeholders})`, idsToDelete, (errLikes) => {
                if (errLikes) {
                    console.error("Błąd podczas usuwania lajków:", errLikes);
                    return res.status(500).json({ message: 'Błąd podczas usuwania lajków komentarzy' });
                }

                db.query(`DELETE FROM "Comments" WHERE id IN (${placeholders})`, idsToDelete, (err3) => {
                    if (err3) {
                        console.error("Błąd podczas usuwania komentarzy:", err3);
                        return res.status(500).json({ message: 'Błąd podczas usuwania komentarzy' });
                    }

                    return res.status(200).json({ message: 'Komentarz i jego odpowiedzi zostały usunięte' });
                });
            });
        });
    });
});

app.get('/admin/comments', (req, res) => {
    const sql = `
        SELECT id, item_id, item_type, parent_id, author_email, content, created_at
        FROM "Comments"
        ORDER BY created_at DESC
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error('Błąd podczas pobierania komentarzy:', err);
            return res.status(500).json({ message: 'Błąd bazy danych' });
        }

        res.status(200).json(results);
    });
});

app.post('/logout', (req, res) => {
    res.status(200).json({ message: 'Wylogowano pomyślnie' });
});

app.listen(PORT, () => {
    console.log(`Serwer działa na porcie ${PORT}`);
});

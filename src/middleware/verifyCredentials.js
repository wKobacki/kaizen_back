const sql = require('../controllers/db');

const verifyUser = async (req, res, next) => {
    try {
        const id = Number(req.params.id);

        if (!id) return res.status(400).json({ message: 'Invalid user ID' });

        const tokenUser = req.user; 

        if (tokenUser.role === "admin") return next();

        if (tokenUser.id !== id) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        next();
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
}

const verifyAdmin = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Access denied: admin only' });
        }

        next();

    } catch (err) {
        console.error('verifyAdmin error:', err);
        return res.status(500).json({ message: 'Server error in verifyAdmin' });
    }
};

module.exports = {verifyUser, verifyAdmin};
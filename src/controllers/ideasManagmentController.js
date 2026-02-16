const sql = require("./db");

const getAllIdeas = async (req, res) => {
    try {
        const res = await sql `SELECT title, description, solution, created_at, status FROM ideas`;

        return res.json({res});
    } catch (error) {
        console.error("Error fetching ideas:", error);
        res.status(500).json({ error: "An error occurred while fetching ideas." });
    }
}

const getIdeasDetailsAdmin = async (req, res) => {
    try {
        const res = await sql `SELECT id, title, description, solution, created_at, status FROM ideas`;

        return res.json({res});
    } catch (error) {
        console.error("Error fetching ideas details for admin:", error);
        res.status(500).json({ error: "An error occurred while fetching ideas details for admin." });
    }
}

module.exports = {
    getAllIdeas,
    getIdeasDetailsAdmin
}
const sql = require("./db");

const getAllIdeas = async (req, res) => {
  try {
    const rows = await sql`
      SELECT id, title, description, solution, created_at, status_id
      FROM ideas
      ORDER BY created_at DESC
    `;

    return res.status(200).json({ res: rows });
  } catch (error) {
    console.error("Error fetching ideas:", error);
    return res.status(500).json({ error: "An error occurred while fetching ideas." });
  }
};

const getIdeaDetailsAdmin = async (req, res) => {
  try {
    const { idea_id } = req.params;
    if (!idea_id) return res.status(400).json({ error: "Idea ID is required." });

    const rows = await sql`
      SELECT
        i.id,
        i.title,
        i.description,
        i.solution,
        i.images,
        i.user_id,
        i.created_at,
        i.status_id,
        i.current_step,
        i.department_id,

        u.email AS user_email,
        u.name  AS user_name,

        d.name AS department_name

      FROM ideas i
      LEFT JOIN users u ON u.id = i.user_id
      LEFT JOIN departments d ON d.id = i.department_id

      WHERE i.id = ${idea_id}
      LIMIT 1
    `;

    const idea = rows?.[0];
    if (!idea) return res.status(404).json({ error: "Idea not found." });

    return res.json(idea);
  } catch (error) {
    console.error("Error fetching idea details:", error);
    return res.status(500).json({ error: "An error occurred while fetching idea details." });
  }
};

const deleteIdea = async (req, res) => {
  try {
    const { idea_id } = req.params;

    if (!idea_id) {
      return res.status(400).json({ error: "Idea ID is required." });
    }

    await sql.begin(async (tx) => {
      const rows = await tx`
        SELECT id
        FROM commissions
        WHERE idea_id = ${idea_id}
        LIMIT 1
      `;

      const commissionId = rows?.[0]?.id ?? null;

      if (commissionId) {
        await tx`DELETE FROM commission_members WHERE commission_id = ${commissionId}`;
        await tx`DELETE FROM commission_goals WHERE commission_id = ${commissionId}`;
        await tx`DELETE FROM commissions WHERE id = ${commissionId}`;
      }

      const del = await tx`DELETE FROM ideas WHERE id = ${idea_id} RETURNING id`;

      if (!del?.length) {
        throw Object.assign(new Error("Idea not found."), { status: 404 });
      }
    });

    return res.status(200).json({ message: "Idea deleted successfully." });
  } catch (error) {
    console.error("Error deleting idea:", error);

    if (error?.status === 404) {
      return res.status(404).json({ error: "Idea not found." });
    }

    return res.status(500).json({ error: "An error occurred while deleting the idea." });
  }
};

const updateIdeaAdmin = async (req, res) => {
  try {
    const { idea_id } = req.params;
    const { title, description, solution, status_id, current_step } = req.body;

    if (!idea_id) return res.status(400).json({ error: "Idea ID is required." });

    if (title !== undefined && String(title).trim().length === 0) {
      return res.status(400).json({ error: "Title cannot be empty." });
    }

    const rows = await sql`
      UPDATE ideas
      SET
        title = COALESCE(${title}, title),
        description = COALESCE(${description}, description),
        solution = COALESCE(${solution}, solution),
        status_id = COALESCE(${status_id}, status_id),
        current_step = COALESCE(${current_step}, current_step)
      WHERE id = ${idea_id}
      RETURNING id, title, description, solution, status_id, current_step, created_at, images
    `;

    const updated = rows?.[0];
    if (!updated) return res.status(404).json({ error: "Idea not found." });

    return res.json(updated);
  } catch (error) {
    console.error("Error updating idea:", error);
    return res.status(500).json({ error: "An error occurred while updating the idea." });
  }
};


module.exports = {
    getAllIdeas,
    getIdeaDetailsAdmin,
    deleteIdea,
    updateIdeaAdmin
}
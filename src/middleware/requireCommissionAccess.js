const sql = require("../controllers/db");

const requireCommissionAccess = ({ allowOwner = false, mode = "read" } = {}) => {
  return async (req, res, next) => {
    try {
      const ideaId = Number(req.params.id);
      const userId = Number(req.user?.id);

      if (!Number.isInteger(ideaId) || !Number.isInteger(userId)) {
        return res.status(400).json({ message: "Invalid id" });
      }

      const roleId = Number(req.user?.role_id);
      const roleName = String(req.user?.role_name || "").toLowerCase();
      const isAdmin = roleId === 1 || roleName === "admin";

      const [idea] = await sql`
        SELECT user_id
        FROM ideas
        WHERE id = ${ideaId}
        LIMIT 1
      `;
      if (!idea) return res.status(404).json({ message: "Idea not found" });

      const isOwner = Number(idea.user_id) === userId;

      const [commission] = await sql`
        SELECT id
        FROM commissions
        WHERE idea_id = ${ideaId}
        LIMIT 1
      `;
      if (!commission) return res.status(404).json({ message: "Commission not found" });

      const member = await sql`
        SELECT 1
        FROM commission_members
        WHERE commission_id = ${commission.id}
          AND user_id = ${userId}
        LIMIT 1
      `;
      const isMember = member.length > 0;

      const canRead = isAdmin || isMember || (allowOwner && isOwner);
      const canWrite = isAdmin || isMember;

      const ok = mode === "write" ? canWrite : canRead;
      if (!ok) return res.status(403).json({ message: "Forbidden" });

      req.commission_id = commission.id;
      req.is_admin = isAdmin;
      req.is_owner = isOwner;
      req.is_commission_member = isMember;

      next();
    } catch (e) {
      console.error("requireCommissionAccess ERROR:", e);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
};

module.exports = { requireCommissionAccess };

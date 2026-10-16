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
        SELECT i.user_id, author.supervisor AS supervisor_id
        FROM ideas i
        LEFT JOIN users author ON author.id = i.user_id
        WHERE i.id = ${ideaId}
        LIMIT 1
      `;
      if (!idea) return res.status(404).json({ message: "Idea not found" });

      const isOwner = Number(idea.user_id) === userId;

      const [commission] = await sql`
        SELECT id, chairman_user_id
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
      const isChairman = Number(commission.chairman_user_id) === userId;

      const canRead = isAdmin || isMember || (allowOwner && isOwner);
      const canWrite = isAdmin || isMember;

      const canManageMembers = isAdmin || isChairman;
      const canAssignFirstChairman =
        mode === "manage-chairman" &&
        !commission.chairman_user_id &&
        Number(idea.supervisor_id) === userId;
      let canEditGoal = false;
      if (mode === "goal-write" && !isAdmin && !isChairman && !isMember) {
        const submittedGoals = Array.isArray(req.body?.goals) ? req.body.goals : [];
        const requestedGoalIds = [
          req.body?.goalId,
          ...submittedGoals.map((goal) => goal?.id),
        ]
          .map(Number)
          .filter((id) => Number.isSafeInteger(id) && id > 0);
        if (requestedGoalIds.length > 0) {
          const assignedGoal = await sql`
            SELECT 1
            FROM commission_goal_assignees cga
            JOIN commission_goals cg ON cg.id = cga.goal_id
            WHERE cg.commission_id = ${commission.id}
              AND cga.user_id = ${userId}
              AND cg.id IN ${sql(requestedGoalIds)}
            LIMIT 1
          `;
          canEditGoal = assignedGoal.length > 0;
        }
      }

      let ok = canRead;
      if (mode === "manage-members") {
        ok = canManageMembers;
      } else if (mode === "manage-chairman") {
        ok = canManageMembers || canAssignFirstChairman;
      } else if (mode === "goal-write") {
        ok = isAdmin || isChairman || isMember || canEditGoal;
      } else if (mode === "write") {
        ok = canWrite;
      }
      if (!ok) return res.status(403).json({ message: "Forbidden" });

      req.commission_id = commission.id;
      req.is_admin = isAdmin;
      req.is_owner = isOwner;
      req.is_commission_member = isMember;
      req.is_commission_chairman = isChairman;

      next();
    } catch (e) {
      console.error("requireCommissionAccess ERROR:", e);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
};

module.exports = { requireCommissionAccess };

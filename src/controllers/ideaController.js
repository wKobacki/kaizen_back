const express = require('express');
const sql = require('./db.js');


const createIdea = async (req, res) => {
  try {
    const { title, description, solution, images = [] } = req.body;

    const userId = req.user?.id;
    if (!title || !description || !solution || !userId) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const [me] = await sql`
      SELECT department_id
      FROM users
      WHERE id = ${userId}
      LIMIT 1
    `;

    if (!me?.department_id) {
      return res.status(400).json({ message: "User has no department assigned" });
    }

    const [submitted] = await sql`
      SELECT id FROM status WHERE name = 'submitted' LIMIT 1
    `;

    const inserted = await sql`
      INSERT INTO ideas (title, description, solution, images, user_id, status_id, current_step, department_id)
      VALUES (
        ${title},
        ${description},
        ${solution},
        ${JSON.stringify(images)},
        ${userId},
        ${submitted.id},
        ${submitted.id},
        ${me.department_id}
      )
      RETURNING id
    `;

    await sql`
      INSERT INTO idea_workflow_log (idea_id, step, action, by_user, description)
      VALUES (${inserted[0].id}, 'submitted', 'created', ${userId}, 'Idea submitted')
    `;

    return res.status(201).json({ message: "Idea created successfully", id: inserted[0].id });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const getAllIdeas = async (req, res) => {
  try {
    const ideas = await sql`
      SELECT
        i.id,
        i.title,
        d.name AS department,
        s.name AS status
      FROM ideas i
      LEFT JOIN departments d ON d.id = i.department_id
      LEFT JOIN status s ON s.id = i.status_id
      ORDER BY i.created_at DESC
    `;

    return res.json({ ideas });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const getIdeaDetails = async (req, res) => {
    try {
        const ideaId = req.params.id;

        const idea = await sql`
            SELECT *
            FROM ideas
            WHERE id = ${ideaId}
        `;

        if (!idea.length) return res.status(404).json({ message: 'Idea not found' });

        const departments = await sql`
            SELECT d.*, dept.name AS department_name
            FROM idea_departments d
            LEFT JOIN departments dept ON dept.id = d.department_id
            WHERE d.idea_id = ${ideaId}
        `;

        const log = await sql`
            SELECT *
            FROM idea_workflow_log
            WHERE idea_id = ${ideaId}
            ORDER BY created_at ASC
        `;

        return res.status(200).json({
            message: 'Success',
            details: idea[0],
            departments,
            log
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const supervisorApprove = async (req, res) => {
    try {
        const id = req.params.id;
        const userId = req.user.id;

        const statusApproved = await sql`
            SELECT id FROM status WHERE name = 'supervisor_approved'
        `;
        const stepDeptReview = await sql`
            SELECT id FROM status WHERE name = 'department_review'
        `;

        await sql`
            UPDATE ideas
            SET status_id = ${statusApproved[0].id},
                current_step = ${stepDeptReview[0].id}
            WHERE id = ${id}
        `;

        await sql`
            INSERT INTO idea_workflow_log (idea_id, step, action, by_user, description)
            VALUES (${id}, 'supervisor_review', 'approved', ${userId}, 'Supervisor approved')
        `;

        return res.json({ message: "Supervisor approval saved" });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const supervisorReject = async (req, res) => {
    try {
        const id = req.params.id;
        const { reason } = req.body;
        const userId = req.user.id;

        const statusRejected = await sql`
            SELECT id FROM status WHERE name = 'supervisor_rejected'
        `;

        await sql`
            UPDATE ideas
            SET status_id = ${statusRejected[0].id},
                current_step = NULL
            WHERE id = ${id}
        `;

        await sql`
            INSERT INTO idea_workflow_log (idea_id, step, action, by_user, description)
            VALUES (${id}, 'supervisor_review', 'rejected', ${userId}, ${reason})
        `;

        return res.json({ message: "Idea rejected by supervisor" });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const assignDepartments = async (req, res) => {
    try {
        const ideaId = req.params.id;
        const { departments } = req.body; 
        const userId = req.user.id;

        if (!Array.isArray(departments))
            return res.status(400).json({ message: 'Invalid departments format' });

        for (const d of departments) {
            await sql`
                INSERT INTO idea_departments (idea_id, department_id, status)
                VALUES (${ideaId}, ${d}, NULL)
            `;
        }

        await sql`
            INSERT INTO idea_workflow_log (idea_id, step, action, by_user, description)
            VALUES (${ideaId}, 'department_review', 'assigned', ${userId}, 'Departments assigned')
        `;

        return res.json({ message: "Departments assigned" });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const departmentDecision = async (req, res) => {
    try {
        const ideaId = req.params.id;
        const { department_id, action, reason } = req.body;
        const userId = req.user.id;

        const statusApproved = await sql`SELECT id FROM status WHERE name = 'department_approved'`;
        const statusRejected = await sql`SELECT id FROM status WHERE name = 'department_rejected'`;

        if (action === "approve") {
            await sql`
                UPDATE idea_departments
                SET status = ${statusApproved[0].id},
                    decided_by = ${userId},
                    decided_at = NOW()
                WHERE idea_id = ${ideaId} AND department_id = ${department_id}
            `;
        }
        else {
            await sql`
                UPDATE idea_departments
                SET status = ${statusRejected[0].id},
                    reject_reason = ${reason},
                    decided_by = ${userId},
                    decided_at = NOW()
                WHERE idea_id = ${ideaId} AND department_id = ${department_id}
            `;

            await sql`
                UPDATE ideas
                SET status_id = ${statusRejected[0].id}
                WHERE id = ${ideaId}
            `;
        }

        await sql`
            INSERT INTO idea_workflow_log (idea_id, step, action, by_user, description)
            VALUES (${ideaId}, 'department_review', ${action}, ${userId}, ${reason || ''})
        `;

        return res.json({ message: "Decision saved" });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const createCommission = async (req, res) => {
    try {
        const ideaId = req.params.id;
        const { members } = req.body;
        const userId = req.user.id;

        const existing = await sql`
            SELECT id FROM commissions WHERE idea_id = ${ideaId}
        `;

        if (existing.length > 0) {
            return res.status(400).json({ message: "Commission already exists for this idea" });
        }


        const commission = await sql`
            INSERT INTO commissions (idea_id, created_by)
            VALUES (${ideaId}, ${userId})
            RETURNING id
        `;

        for (const member of members) {
            await sql`
                INSERT INTO commission_members (commission_id, user_id)
                VALUES (${commission[0].id}, ${member})
            `;
        }

        const statusCommission = await sql`SELECT id FROM status WHERE name = 'commission_created'`;

        await sql`
            UPDATE ideas
            SET status_id = ${statusCommission[0].id}
            WHERE id = ${ideaId}
        `;

        await sql`
            INSERT INTO idea_workflow_log (idea_id, step, action, by_user, description)
            VALUES (${ideaId}, 'commission', 'created', ${userId}, 'Commission created')
        `;

        return res.json({ message: "Commission created" });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const completeIdea = async (req, res) => {
    try {
        const id = req.params.id;
        const userId = req.user.id;

        const statusCompleted = await sql`
            SELECT id FROM status WHERE name = 'completed'
        `;

        await sql`
            UPDATE ideas
            SET status_id = ${statusCompleted[0].id}
            WHERE id = ${id}
        `;

        await sql`
            INSERT INTO idea_workflow_log (idea_id, step, action, by_user, description)
            VALUES (${id}, 'final', 'completed', ${userId}, 'Idea implemented successfully')
        `;

        return res.json({ message: "Idea marked as completed" });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const getIdeaWorkflow = async (req, res) => {
    try {
        const ideaId = req.params.id;

        const log = await sql`
            SELECT 
                l.*,
                u.name AS by_user_name,
                u.surname AS by_user_surname
            FROM idea_workflow_log l
            LEFT JOIN users u ON u.id = l.by_user
            WHERE l.idea_id = ${ideaId}
            ORDER BY l.created_at ASC
        `;

        return res.status(200).json({ result: log });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const getIdeaDepartmentsShort = async (req, res) => {
    try {
        const ideaId = req.params.id;

        if(!ideaId) return res.status(400).json({message: "userId is required"});

        const depts = await sql`
            SELECT 
                d.id,
                d.department_id,
                dept.name AS department_name,
                d.status,
                s.name AS status_name,
                d.decided_by,
                u.name AS decided_by_name,
                u.surname AS decided_by_surname,
                d.decided_at,
                d.reject_reason
            FROM idea_departments d
            LEFT JOIN departments dept ON dept.id = d.department_id
            LEFT JOIN status s ON s.id = d.status
            LEFT JOIN users u ON u.id = d.decided_by
            WHERE d.idea_id = ${ideaId}
            ORDER BY dept.name ASC
        `;

        return res.status(200).json({ result: depts });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const saveCommissionGoals = async (req, res) => {
    try {
        const ideaId = req.params.id;
        const { goals } = req.body;

        if (!Array.isArray(goals) || goals.length === 0) {
            return res.status(400).json({ message: "Goals array is required" });
        }

        const commission = await sql`
            SELECT id FROM commissions 
            WHERE idea_id = ${ideaId}
            LIMIT 1
        `;

        if (commission.length === 0) {
            return res.status(400).json({ message: "No commission found for this idea" });
        }

        const commissionId = commission[0].id;
        const createdBy = req.user?.id || 1;

        // Czyścimy cele
        await sql`
            DELETE FROM commission_goals
            WHERE commission_id = ${commissionId}
        `;

        // Dodajemy nowe cele
        for (const g of goals) {
            await sql`
                INSERT INTO commission_goals (
                    idea_id,
                    commission_id,
                    goals,
                    steps,
                    estimated_cost,
                    due_date,
                    created_by,
                    is_done
                )
                VALUES (
                    ${ideaId},
                    ${commissionId},
                    ${g.title || ""},
                    ${g.description || ""},
                    ${g.estimated_cost || 0},
                    ${g.deadline || null},
                    ${createdBy},
                    ${g.is_done === true}
                )
            `;
        }

        return res.json({ message: "Commission goals saved successfully" });

    } catch (error) {
        console.error("SAVE GOALS ERROR:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};


const checkCommissionExists = async (req, res) => {
    try {
        const ideaId = req.params.id;

        const commission = await sql`
            SELECT id FROM commissions WHERE idea_id = ${ideaId}
        `;

        if (commission.length === 0) {
            return res.json({ exists: false, members: [] });
        }

        const members = await sql`
            SELECT user_id 
            FROM commission_members
            WHERE commission_id = ${commission[0].id}
        `;

        return res.json({
            exists: true,
            commission_id: commission[0].id,
            members
        });

    } catch (error) {
        console.error("CHECK COMMISSION ERROR:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};


const getCommissionGoals = async (req, res) => {
    try {
        const ideaId = req.params.id;

        const commission = await sql`
            SELECT id 
            FROM commissions 
            WHERE idea_id = ${ideaId}
            LIMIT 1
        `;

        if (commission.length === 0) {
            return res.json({ goals: [] });
        }

        const commissionId = commission[0].id;

        const rows = await sql`
            SELECT 
                id, 
                goals, 
                steps, 
                estimated_cost, 
                due_date, 
                created_by, 
                created_at,
                is_done
            FROM commission_goals
            WHERE commission_id = ${commissionId}
            ORDER BY id
        `;

        const goals = rows.map(r => ({
            id: r.id,
            title: r.goals,
            description: r.steps,
            estimated_cost: r.estimated_cost,
            deadline: r.due_date,
            created_by: r.created_by,
            created_at: r.created_at,
            is_done: r.is_done === true 
        }));

        return res.json({ goals });

    } catch (error) {
        console.error("GET GOALS ERROR:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};


const updateCommissionGoalStatus = async (req, res) => {
    try {
        const ideaId = req.params.id;
        const { goalId, is_done } = req.body;

        if (goalId === undefined) {
            return res.status(400).json({ message: "goalId is required" });
        }

        if (typeof is_done !== "boolean") {
            return res.status(400).json({ message: "is_done must be boolean" });
        }

        const commission = await sql`
            SELECT id 
            FROM commissions
            WHERE idea_id = ${ideaId}
            LIMIT 1
        `;

        if (commission.length === 0) {
            return res.status(404).json({ message: "Commission not found" });
        }

        const commissionId = commission[0].id;

        const goal = await sql`
            SELECT id
            FROM commission_goals
            WHERE id = ${goalId}
              AND commission_id = ${commissionId}
        `;

        if (goal.length === 0) {
            return res.status(404).json({ message: "Goal not found" });
        }

        await sql`
            UPDATE commission_goals
            SET is_done = ${is_done}
            WHERE id = ${goalId}
              AND commission_id = ${commissionId}
        `;

        return res.json({ message: "Goal updated successfully" });

    } catch (error) {
        console.error("PATCH GOAL ERROR:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};


const updateCommissionMembers = async (req, res) => {
    try {
        const ideaId = req.params.id;
        const { members } = req.body;

        if (!Array.isArray(members)) {
            return res.status(400).json({ message: "members must be an array" });
        }

        const existing = await sql`
            SELECT id FROM commissions WHERE idea_id = ${ideaId}
        `;

        if (existing.length === 0) {
            return res.status(400).json({ message: "Commission not exists" });
        }

        const commissionId = existing[0].id;

        await sql`
            DELETE FROM commission_members 
            WHERE commission_id = ${commissionId}
        `;

        for (const memberId of members) {
            await sql`
                INSERT INTO commission_members (commission_id, user_id)
                VALUES (${commissionId}, ${memberId})
            `;
        }

        return res.json({
            message: "Commission updated successfully",
            commissionId
        });

    } catch (error) {
        console.error("UPDATE MEMBERS ERROR:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

module.exports = {
    createIdea,
    getAllIdeas,
    getIdeaDetails,
    supervisorApprove,
    supervisorReject,
    assignDepartments,
    departmentDecision,
    createCommission,
    completeIdea,
    getIdeaWorkflow,
    getIdeaDepartmentsShort,
    saveCommissionGoals,
    checkCommissionExists, 
    getCommissionGoals,
    updateCommissionGoalStatus,
    updateCommissionMembers
};
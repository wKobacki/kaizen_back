const express = require('express');
const sql = require('./db.js');


const createIdea = async (req, res) => {
    try {
        const { title, description, solution, images = [], userId, department } = req.body;
        
        if (!title || !description || !solution || !userId)
            return res.status(400).json({ message: 'Missing required fields' });

        const submittedStatus = await sql`
            SELECT id FROM status WHERE name = 'submitted'
        `;

        const inserted = await sql`
            INSERT INTO ideas (title, description, solution, images, user_id, status_id, current_step, department)
            VALUES (
                ${title},
                ${description},
                ${solution},
                ${JSON.stringify(images)},
                ${userId},
                ${submittedStatus[0].id},
                ${submittedStatus[0].id},
                ${department}
            )
            RETURNING id
        `;

        await sql`
            INSERT INTO idea_workflow_log (idea_id, step, action, by_user, description)
            VALUES (${inserted[0].id}, 'submitted', 'created', ${userId}, 'Idea submitted')
        `;

        return res.status(201).json({
            message: 'Idea created successfully',
            id: inserted[0].id
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const getAllIdeas = async (req, res) => {
    try {
        const results = await sql`
            SELECT id, title, status_id, department
            FROM ideas
        `;

        return res.status(200).json({ message: 'Success', ideas: results });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Internal server error' });
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
    getIdeaDepartmentsShort
};
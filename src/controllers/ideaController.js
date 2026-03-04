const express = require('express');
const sql = require('./db.js');
const {
  notifySupervisorApproved,
  notifySupervisorRejected,
  notifyDepartmentsAssigned,
  notifyDepartmentDecision,
  notifyCommissionCreated,
  notifyCommissionMembersAdded,
  notifyIdeaResponsiblesAssigned,
  notifyIdeaCompleted,
  notifyCommissionChairmanAssigned
} = require("../services/ideaNotificationService.js");

const uniqInt = (arr) => {
  const s = new Set();
  for (const v of arr) {
    const n = Number(v);
    if (Number.isInteger(n)) s.add(n);
  }
  return [...s];
};

const norm = (v) => String(v ?? "").trim().toLowerCase();

const getStatusId = async (trx, name) => {
  const [row] = await trx`SELECT id FROM status WHERE name = ${name} LIMIT 1`;
  if (!row) throw new Error(`Missing status in DB: ${name}`);
  return Number(row.id);
};

const ensureCommissionWithDeptSupervisors = async (trx, ideaId, createdBy) => {
  const inserted = await trx`
    INSERT INTO commissions (idea_id, created_by)
    VALUES (${ideaId}, ${createdBy})
    ON CONFLICT (idea_id) DO NOTHING
    RETURNING id
  `;

  let commissionId = inserted?.[0]?.id;

  if (!commissionId) {
    const [existing] = await trx`
      SELECT id FROM commissions WHERE idea_id = ${ideaId} LIMIT 1
    `;
    commissionId = existing?.id;
  }

  if (!commissionId) {
    throw new Error("Cannot resolve commissionId");
  }

  const approvedId = await getStatusId(trx, "department_approved");

  const rows = await trx`
    SELECT DISTINCT d.supervisor_user_id AS user_id
    FROM idea_departments idp
    JOIN departments d ON d.id = idp.department_id
    WHERE idp.idea_id = ${ideaId}
      AND idp.status_id = ${approvedId}
      AND d.supervisor_user_id IS NOT NULL
  `;

  const supervisorIds = uniqInt(rows.map((r) => r.user_id));

  let addedCount = 0;

  if (supervisorIds.length > 0) {
    const values = supervisorIds.map((uid) => [commissionId, uid]);

    const insertedMembers = await trx`
      INSERT INTO commission_members (commission_id, user_id)
      VALUES ${trx(values)}
      ON CONFLICT (commission_id, user_id) DO NOTHING
      RETURNING id
    `;

    addedCount = insertedMembers?.length ?? 0;
  }

  return { commissionId, addedCount, supervisorIds };
};

const ensureCommissionMembers = async (ideaId, userIds, trx = sql) => {
  console.log("[ensureCommissionMembers] input:", {
    ideaId,
    userIds,
    userIdsType: Array.isArray(userIds) ? "array" : typeof userIds,
  });

  const ids = [...new Set((Array.isArray(userIds) ? userIds : [])
    .map((x) => Number(x))
    .filter(Number.isInteger))];

  console.log("[ensureCommissionMembers] normalized ids:", ids);

  if (ids.length === 0) {
    console.log("[ensureCommissionMembers] skip: no ids");
    return { addedUserIds: [] };
  }

  const rows = await trx`SELECT id FROM commissions WHERE idea_id = ${ideaId}`;
  console.log("[ensureCommissionMembers] commissions rows:", rows);

  if (!rows?.length) {
    console.log("[ensureCommissionMembers] skip: no commission for ideaId", ideaId);
    return { addedUserIds: [] };
  }

  const commissionId = rows[0].id;
  console.log("[ensureCommissionMembers] commissionId:", commissionId);

  const existing = await trx`
    SELECT user_id
    FROM commission_members
    WHERE commission_id = ${commissionId}
  `;
  const existingIds = existing.map((r) => Number(r.user_id)).filter(Number.isInteger);
  const existingSet = new Set(existingIds);

  console.log("[ensureCommissionMembers] existing user_ids:", existingIds);

  const toAdd = ids.filter((uid) => !existingSet.has(uid));
  console.log("[ensureCommissionMembers] toAdd:", toAdd);

  if (toAdd.length === 0) {
    console.log("[ensureCommissionMembers] skip: all already members");
    return { addedUserIds: [] };
  }

  const addedUserIds = [];

  for (const uid of toAdd) {
    const inserted = await trx`
      INSERT INTO commission_members (commission_id, user_id)
      VALUES (${commissionId}, ${uid})
      ON CONFLICT (commission_id, user_id) DO NOTHING
      RETURNING id, commission_id, user_id
    `;

    if (inserted?.length) {
      console.log("[ensureCommissionMembers] inserted:", inserted[0]);
      addedUserIds.push(uid);
    } else {
      console.log("[ensureCommissionMembers] skipped by conflict:", { commissionId, uid });
    }
  }

  return { addedUserIds };
};

const createIdea = async (req, res) => {
  try {
    const { title, description, solution, department_id } = req.body;
    const userId = req.user?.id;

    if (!title || !description || !solution || !userId) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (!department_id) {
      return res.status(400).json({ message: "department_id is required" });
    }

    const [dep] = await sql`
      SELECT id FROM departments WHERE id = ${Number(department_id)} LIMIT 1
    `;
    if (!dep) {
      return res.status(400).json({ message: "Invalid department_id" });
    }

    const [submitted] = await sql`
      SELECT id FROM status WHERE name = 'submitted' LIMIT 1
    `;

    const uploadedImages = Array.isArray(req.files)
      ? req.files.map((f) => `/upload/ideas/${f.filename}`)
      : [];

    const inserted = await sql`
      INSERT INTO ideas (
        title, description, solution, images,
        user_id, status_id, current_step, department_id
      )
      VALUES (
        ${title},
        ${description},
        ${solution},
        ${JSON.stringify(uploadedImages)},
        ${userId},
        ${submitted.id},
        ${submitted.id},
        ${Number(department_id)}
      )
      RETURNING id
    `;

    await sql`
      INSERT INTO idea_workflow_log (idea_id, step, action, by_user, description)
      VALUES (${inserted[0].id}, 'submitted', 'created', ${userId}, 'Idea submitted')
    `;

    return res.status(201).json({
      message: "Idea created successfully",
      id: inserted[0].id,
      images: uploadedImages
    });
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
        s.name AS status,
        i.created_at
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
    const ideaId = Number(req.params.id);
    const userId = Number(req.user?.id);

    if (!Number.isInteger(ideaId)) {
      return res.status(400).json({ message: "Invalid idea id" });
    }
    if (!Number.isInteger(userId)) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const roleName = norm(req.user?.role_name);
    const roleId = Number(req.user?.role_id ?? req.user?.roleId ?? null);
    const isAdmin = roleName === "admin" || roleId === 1;
    const isSupervisorRole = roleName === "supervisor";

    const ideaRows = await sql`
      SELECT
        i.*,
        d.name AS department_name,
        s.name  AS status_code,
        s.name  AS status_name,
        cs.name AS current_step_code,
        cs.name AS current_step_name,
        au.supervisor AS submitter_supervisor_id,
        sup.name AS submitter_supervisor_name,
        sup.surname AS submitter_supervisor_surname,
        sup.email AS submitter_supervisor_email
      FROM ideas i
      LEFT JOIN departments d ON d.id = i.department_id
      LEFT JOIN status s ON s.id = i.status_id
      LEFT JOIN status cs ON cs.id = i.current_step
      LEFT JOIN users au ON au.id = i.user_id
      LEFT JOIN users sup ON sup.id = au.supervisor
      WHERE i.id = ${ideaId}
      LIMIT 1
    `;

    if (ideaRows.length === 0) {
      return res.status(404).json({ message: "Idea not found" });
    }

    const idea = ideaRows[0];

    const ownerId = Number(idea.user_id);
    const isOwner = Number.isInteger(ownerId) && ownerId === userId;

    const cm = await sql`
      SELECT 1
      FROM commissions c
      JOIN commission_members cm ON cm.commission_id = c.id
      WHERE c.idea_id = ${ideaId}
        AND cm.user_id = ${userId}
      LIMIT 1
    `;
    const isCommissionMember = cm.length > 0;

    const submitterSupervisorId = Number(idea.submitter_supervisor_id);
    const isIdeaSupervisor =
      Number.isInteger(submitterSupervisorId) && submitterSupervisorId === userId;

    const canSeeAll = isAdmin || isOwner || isCommissionMember || isIdeaSupervisor;

    const log = await sql`
      SELECT *
      FROM idea_workflow_log
      WHERE idea_id = ${ideaId}
      ORDER BY created_at ASC
    `;

    let departments = [];

    if (canSeeAll) {
      departments = await sql`
        SELECT
          idp.*,
          dept.name AS department_name,
          s.name    AS status_code,
          s.name    AS status_name
        FROM idea_departments idp
        LEFT JOIN departments dept ON dept.id = idp.department_id
        LEFT JOIN status s ON s.id = idp.status_id
        WHERE idp.idea_id = ${ideaId}
        ORDER BY idp.id
      `;
    } else {
      departments = await sql`
        SELECT
          idp.*,
          dept.name AS department_name,
          s.name    AS status_code,
          s.name    AS status_name
        FROM idea_departments idp
        JOIN departments dept ON dept.id = idp.department_id
        LEFT JOIN status s ON s.id = idp.status_id
        WHERE idp.idea_id = ${ideaId}
          AND dept.supervisor_user_id = ${userId}
        ORDER BY idp.id
      `;
    }

    return res.status(200).json({
      message: "Success",
      details: idea,
      log,
      departments,
      access: {
        role_id: Number.isInteger(roleId) ? roleId : null,
        role_name: roleName,
        isAdmin,
        isSupervisorRole,
        isOwner,
        isCommissionMember,
        isIdeaSupervisor,
        canSeeAll,
        submitterSupervisorId: Number.isInteger(submitterSupervisorId)
          ? submitterSupervisorId
          : null,
      },
    });
  } catch (error) {
    console.error("getIdeaDetails ERROR:", error);
    return res.status(500).json({ message: "Internal server error" });
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

    try {
      await notifySupervisorApproved({ ideaId: Number(id) });
    } catch (mailErr) {
      console.error("notifySupervisorApproved ERROR:", mailErr);
    }

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

    try {
      await notifySupervisorRejected({
        ideaId: Number(id),
        reason: reason || "",
      });
    } catch (mailErr) {
      console.error("notifySupervisorRejected ERROR:", mailErr);
    }

    return res.json({ message: "Idea rejected by supervisor" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

const assignDepartments = async (req, res) => {
  try {
    const ideaId = Number(req.params.id);
    const { departments } = req.body;
    const userId = req.user.id;

    if (!Number.isInteger(ideaId)) {
      return res.status(400).json({ message: "Invalid idea id" });
    }
    if (!Array.isArray(departments)) {
      return res.status(400).json({ message: "Invalid departments format" });
    }

    const [pending] = await sql`
      SELECT id FROM status WHERE name = 'department_review' LIMIT 1
    `;
    if (!pending) {
      return res.status(500).json({ message: "Missing status: department_review" });
    }

    const depIds = [...new Set(departments)]
      .map(Number)
      .filter((x) => Number.isInteger(x));

    if (depIds.length === 0) {
      return res.status(400).json({ message: "No valid departments provided" });
    }

    await sql.begin(async (trx) => {
      for (const d of depIds) {
        await trx`
          INSERT INTO idea_departments (
            idea_id,
            department_id,
            status_id,
            decided_by,
            decided_at,
            reject_reason
          )
          VALUES (
            ${ideaId},
            ${d},
            ${pending.id},
            NULL,
            NULL,
            NULL
          )
          ON CONFLICT (idea_id, department_id) DO UPDATE SET
            status_id = EXCLUDED.status_id,
            decided_by = NULL,
            decided_at = NULL,
            reject_reason = NULL
        `;
      }

      await trx`
        INSERT INTO idea_workflow_log (idea_id, step, action, by_user, description)
        VALUES (${ideaId}, 'department_review', 'assigned', ${userId}, 'Departments assigned')
      `;
    });

    try {
      await notifyDepartmentsAssigned({ ideaId });
    } catch (mailErr) {
      console.error("notifyDepartmentsAssigned ERROR:", mailErr);
    }

    return res.json({ message: "Departments assigned" });
  } catch (error) {
    console.error("assignDepartments ERROR:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const departmentDecision = async (req, res) => {
  try {
    const ideaId = Number(req.params.id);
    const { department_id, action, reason } = req.body;
    const userId = req.user.id;

    if (!Number.isInteger(ideaId) || !Number.isInteger(Number(department_id))) {
      return res.status(400).json({ message: "Invalid ids" });
    }

    if (action !== "approve" && action !== "reject") {
      return res.status(400).json({ message: "action must be approve or reject" });
    }

    let responsePayload = { message: "Decision saved" };
    let shouldNotifyCommissionAutoCreated = false;
    let autoCommissionSupervisorIds = [];

    await sql.begin(async (trx) => {
      const statusApprovedId = await getStatusId(trx, "department_approved");
      const statusRejectedId = await getStatusId(trx, "department_rejected");
      const statusReviewId = await getStatusId(trx, "department_review");
      const statusCommissionCreatedId = await getStatusId(trx, "commission_created");

      if (action === "approve") {
        await trx`
          UPDATE idea_departments
          SET status_id = ${statusApprovedId},
              decided_by = ${userId},
              decided_at = NOW(),
              reject_reason = NULL
          WHERE idea_id = ${ideaId} AND department_id = ${Number(department_id)}
        `;
      } else {
        await trx`
          UPDATE idea_departments
          SET status_id = ${statusRejectedId},
              reject_reason = ${reason || ""},
              decided_by = ${userId},
              decided_at = NOW()
          WHERE idea_id = ${ideaId} AND department_id = ${Number(department_id)}
        `;
      }

      await trx`
        INSERT INTO idea_workflow_log (idea_id, step, action, by_user, description)
        VALUES (${ideaId}, 'department_review', ${action}, ${userId}, ${reason || ''})
      `;

      const deptRows = await trx`
        SELECT department_id, status_id
        FROM idea_departments
        WHERE idea_id = ${ideaId}
      `;

      const anyRejected = deptRows.some((r) => r.status_id === statusRejectedId);
      const allApproved = deptRows.length > 0 && deptRows.every((r) => r.status_id === statusApprovedId);

      if (anyRejected) {
        await trx`
          UPDATE ideas
          SET status_id = ${statusRejectedId},
              current_step = ${statusRejectedId}
          WHERE id = ${ideaId}
        `;
      } else if (allApproved) {
        const { commissionId, addedCount, supervisorIds } = await ensureCommissionWithDeptSupervisors(trx, ideaId, userId);
        shouldNotifyCommissionAutoCreated = true;
        autoCommissionSupervisorIds = Array.isArray(supervisorIds) ? supervisorIds : [];

        await trx`
          UPDATE ideas
          SET status_id = ${statusCommissionCreatedId},
              current_step = ${statusCommissionCreatedId}
          WHERE id = ${ideaId}
        `;

        await trx`
          INSERT INTO idea_workflow_log (idea_id, step, action, by_user, description)
          VALUES (${ideaId}, 'commission', 'auto_created', ${userId},
                  ${`Commission auto-created. Added supervisors: ${addedCount}`})
        `;

        responsePayload = {
          message: "All departments approved. Commission auto-created.",
          commissionId
        };
      } else {
        await trx`
          UPDATE ideas
          SET status_id = ${statusReviewId},
              current_step = ${statusReviewId}
          WHERE id = ${ideaId}
        `;
      }
    });

    try {
      await notifyDepartmentDecision({
        ideaId,
        departmentId: Number(department_id),
        action,
        reason: reason || "",
      });
    } catch (mailErr) {
      console.error("notifyDepartmentDecision ERROR:", mailErr);
    }

    if (shouldNotifyCommissionAutoCreated) {
      try {
        await notifyCommissionCreated({
          ideaId,
          memberIds: autoCommissionSupervisorIds,
          source: "auto",
        });
      } catch (mailErr) {
        console.error("notifyCommissionCreated(auto) ERROR:", mailErr);
      }
    }

    return res.json(responsePayload);
  } catch (error) {
    console.error("departmentDecision ERROR:", error);
    return res.status(500).json({ message: "Internal server error" });
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
      SET status_id = ${statusCommission[0].id},
          current_step = ${statusCommission[0].id}
      WHERE id = ${ideaId}
    `;

    await sql`
      INSERT INTO idea_workflow_log (idea_id, step, action, by_user, description)
      VALUES (${ideaId}, 'commission', 'created', ${userId}, 'Commission created')
    `;

    try {
      await notifyCommissionCreated({
        ideaId: Number(ideaId),
        memberIds: Array.isArray(members) ? members : [],
        source: "manual",
      });
    } catch (mailErr) {
      console.error("notifyCommissionCreated(manual) ERROR:", mailErr);
    }

    return res.json({ message: "Commission created" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

const completeIdea = async (req, res) => {
  try {
    const ideaId = Number(req.params.id);
    const userId = Number(req.user?.id);
    const userRoleId = Number(req.user?.role_id);

    if (!Number.isInteger(ideaId)) {
      return res.status(400).json({ message: "Invalid idea id" });
    }

    if (!Number.isInteger(userId)) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const ideaRows = await sql`
      SELECT id, status_id, current_step
      FROM ideas
      WHERE id = ${ideaId}
      LIMIT 1
    `;

    if (ideaRows.length === 0) {
      return res.status(404).json({ message: "Idea not found" });
    }

    const statusCompletedRows = await sql`
      SELECT id FROM status WHERE name = 'completed' LIMIT 1
    `;

    if (statusCompletedRows.length === 0) {
      return res.status(500).json({ message: "Completed status is missing in database" });
    }

    const completedStatusId = Number(statusCompletedRows[0].id);

    const chairmanRows = await sql`
      SELECT c.chairman_user_id
      FROM commissions c
      WHERE c.idea_id = ${ideaId}
      LIMIT 1
    `;

    const chairmanUserId = Number(chairmanRows?.[0]?.chairman_user_id);

    const isAdmin = userRoleId === 1;
    const isChairman = Number.isInteger(chairmanUserId) && chairmanUserId === userId;

    if (!isAdmin && !isChairman) {
      return res.status(403).json({
        message: "Only admin or commission chairman can complete this idea",
      });
    }

    await sql.begin(async (trx) => {
      await trx`
        UPDATE ideas
        SET
          status_id = ${completedStatusId},
          current_step = ${completedStatusId}
        WHERE id = ${ideaId}
      `;

      await trx`
        INSERT INTO idea_workflow_log (idea_id, step, action, by_user, description)
        VALUES (
          ${ideaId},
          'final',
          'completed',
          ${userId},
          ${isChairman ? 'Idea implemented successfully (completed by commission chairman)' : 'Idea implemented successfully'}
        )
      `;
    });

    try {
      await notifyIdeaCompleted({ ideaId });
    } catch (mailErr) {
      console.error("notifyIdeaCompleted ERROR:", mailErr);
    }

    return res.json({
      message: "Idea marked as completed",
      completedBy: isChairman ? "chairman" : "admin",
    });
  } catch (error) {
    console.error("COMPLETE IDEA ERROR:", error);
    return res.status(500).json({ message: "Internal server error" });
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

    if (!ideaId) {
      return res.status(400).json({ message: "ideaId is required" });
    }

    const depts = await sql`
      SELECT 
        d.id,
        d.department_id,
        dept.name AS department_name,
        d.status_id,
        s.name AS status_name,
        d.decided_by,
        u.name AS decided_by_name,
        u.surname AS decided_by_surname,
        d.decided_at,
        d.reject_reason
      FROM idea_departments d
      LEFT JOIN departments dept ON dept.id = d.department_id
      LEFT JOIN status s ON s.id = d.status_id
      LEFT JOIN users u ON u.id = d.decided_by
      WHERE d.idea_id = ${ideaId}
      ORDER BY dept.name ASC
    `;

    return res.status(200).json({ result: depts });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const saveCommissionGoals = async (req, res) => {
  try {
    console.log("content-type:", req.headers["content-type"]);
    console.log("raw body:", req.body);

    const ideaId = Number(req.params.id);
    const { goals } = req.body;

    if (!Number.isInteger(ideaId)) {
      return res.status(400).json({ message: "Invalid idea id" });
    }

    if (!Array.isArray(goals)) {
      return res.status(400).json({ message: "Goals array is required" });
    }

    const [commission] = await sql`
      SELECT id FROM commissions WHERE idea_id = ${ideaId} LIMIT 1
    `;
    if (!commission) {
      return res.status(400).json({ message: "No commission found for this idea" });
    }

    const commissionId = commission.id;
    const createdBy = req.user?.id || 1;

    const assignedUserIds = goals.flatMap((g) => {
      const a = g?.assigned_to;
      if (Array.isArray(a)) return a;
      if (a === null || typeof a === "undefined" || a === "") return [];
      return [a];
    });

    let commissionMembersAddedByGoals = [];

    await sql.begin(async (trx) => {
      const ensureResult = await ensureCommissionMembers(ideaId, assignedUserIds, trx);
      commissionMembersAddedByGoals = Array.isArray(ensureResult?.addedUserIds)
        ? ensureResult.addedUserIds
        : [];

      const oldGoals = await trx`
        SELECT id FROM commission_goals WHERE commission_id = ${commissionId}
      `;

      if (oldGoals.length) {
        const ids = oldGoals.map((g) => g.id);
        await trx`DELETE FROM commission_goal_assignees WHERE goal_id IN ${trx(ids)}`;
      }

      await trx`DELETE FROM commission_goals WHERE commission_id = ${commissionId}`;

      for (const g of goals) {
        const title = (g.title || "").trim();

        const [inserted] = await trx`
          INSERT INTO commission_goals (
            idea_id, commission_id, goals, steps, estimated_cost, due_date, created_by, is_done
          )
          VALUES (
            ${ideaId},
            ${commissionId},
            ${title},
            ${g.description || ""},
            ${g.estimated_cost || 0},
            ${g.deadline || null},
            ${createdBy},
            ${g.is_done === true}
          )
          RETURNING id
        `;

        const assigneesRaw = g?.assigned_to;
        const assignees = Array.isArray(assigneesRaw)
          ? assigneesRaw
          : assigneesRaw === null || typeof assigneesRaw === "undefined" || assigneesRaw === ""
            ? []
            : [assigneesRaw];

        const unique = [...new Set(assignees.map(Number).filter(Number.isInteger))];

        for (const userId of unique) {
          await trx`
            INSERT INTO commission_goal_assignees (goal_id, user_id)
            VALUES (${inserted.id}, ${userId})
            ON CONFLICT (goal_id, user_id) DO NOTHING
          `;
        }
      }
    });

    if (commissionMembersAddedByGoals.length > 0) {
      try {
        await notifyCommissionMembersAdded({
          ideaId,
          userIds: commissionMembersAddedByGoals,
        });
      } catch (mailErr) {
        console.error("notifyCommissionMembersAdded(from saveCommissionGoals) ERROR:", mailErr);
      }
    }

    return res.json({ message: "Commission goals saved successfully" });
  } catch (error) {
    console.error("SAVE GOALS ERROR:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const checkCommissionExists = async (req, res) => {
  try {
    const ideaId = Number(req.params.id);
    const userId = Number(req.user?.id);
    const roleId = Number(req.user?.role_id ?? req.user?.roleId ?? req.user?.userRoleId);
    const isAdmin = roleId === 1;

    const [idea] = await sql`SELECT user_id FROM ideas WHERE id = ${ideaId} LIMIT 1`;
    if (!idea) return res.json({ exists: false, isMember: false });

    const isOwner = Number(idea.user_id) === userId;

    const commissionRows = await sql`
      SELECT id FROM commissions WHERE idea_id = ${ideaId} LIMIT 1
    `;
    if (commissionRows.length === 0) {
      return res.json({ exists: false, isMember: false });
    }

    const commissionId = commissionRows[0].id;

    const me = await sql`
      SELECT 1 FROM commission_members
      WHERE commission_id = ${commissionId} AND user_id = ${userId}
      LIMIT 1
    `;

    let members = [];
    if (isAdmin || isOwner) {
      members = await sql`
        SELECT user_id
        FROM commission_members
        WHERE commission_id = ${commissionId}
      `;
    }

    return res.json({
      exists: true,
      commission_id: commissionId,
      isMember: me.length > 0,
      members,
    });
  } catch (error) {
    console.error("checkCommissionExists ERROR:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const getCommissionGoals = async (req, res) => {
  try {
    const ideaId = Number(req.params.id);

    const [commission] = await sql`
      SELECT id FROM commissions WHERE idea_id = ${ideaId} LIMIT 1
    `;

    if (!commission) return res.json({ goals: [] });

    const commissionId = commission.id;

    const rows = await sql`
      SELECT
        cg.id,
        cg.goals,
        cg.steps,
        cg.estimated_cost,
        cg.due_date,
        cg.created_by,
        cg.created_at,
        cg.is_done,
        COALESCE(
          array_agg(cga.user_id) FILTER (WHERE cga.user_id IS NOT NULL),
          '{}'::int[]
        ) AS assigned_to
      FROM commission_goals cg
      LEFT JOIN commission_goal_assignees cga ON cga.goal_id = cg.id
      WHERE cg.commission_id = ${commissionId}
      GROUP BY cg.id
      ORDER BY cg.id
    `;

    const goals = rows.map(r => ({
      id: r.id,
      title: r.goals,
      description: r.steps,
      estimated_cost: r.estimated_cost,
      deadline: r.due_date,
      created_by: r.created_by,
      created_at: r.created_at,
      is_done: r.is_done === true,
      assigned_to: Array.isArray(r.assigned_to) ? r.assigned_to : []
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
    const ideaId = Number(req.params.id);
    const { members } = req.body;

    if (!Number.isInteger(ideaId)) {
      return res.status(400).json({ message: "Invalid idea id" });
    }

    if (!Array.isArray(members)) {
      return res.status(400).json({ message: "Not supported format" });
    }

    const normalizedMembers = [...new Set(members.map(Number).filter(Number.isInteger))];

    const existing = await sql`
      SELECT id
      FROM commissions
      WHERE idea_id = ${ideaId}
      LIMIT 1
    `;

    if (existing.length === 0) {
      return res.status(400).json({ message: "Commission not exists" });
    }

    const commissionId = Number(existing[0].id);

    const existingMembersRows = await sql`
      SELECT user_id
      FROM commission_members
      WHERE commission_id = ${commissionId}
    `;

    const existingMemberIds = existingMembersRows
      .map((r) => Number(r.user_id))
      .filter(Number.isInteger);

    const existingSet = new Set(existingMemberIds);
    const newlyAddedIds = normalizedMembers.filter((uid) => !existingSet.has(uid));

    const chairmanRows = await sql`
      SELECT chairman_user_id
      FROM commissions
      WHERE id = ${commissionId}
      LIMIT 1
    `;

    const currentChairmanId = Number(chairmanRows?.[0]?.chairman_user_id);

    await sql`
      DELETE FROM commission_members
      WHERE commission_id = ${commissionId}
    `;

    for (const memberId of normalizedMembers) {
      await sql`
        INSERT INTO commission_members (commission_id, user_id)
        VALUES (${commissionId}, ${memberId})
      `;
    }

    let chairmanCleared = false;
    if (
      Number.isInteger(currentChairmanId) &&
      !normalizedMembers.includes(currentChairmanId)
    ) {
      await sql`
        UPDATE commissions
        SET chairman_user_id = NULL
        WHERE id = ${commissionId}
      `;
      chairmanCleared = true;
    }

    if (newlyAddedIds.length > 0) {
      try {
        await notifyCommissionMembersAdded({
          ideaId,
          userIds: newlyAddedIds,
        });
      } catch (mailErr) {
        console.error("notifyCommissionMembersAdded ERROR:", mailErr);
      }
    }

    return res.json({
      message: "Commission updated successfully",
      commissionId,
      chairmanCleared,
    });
  } catch (error) {
    console.error("UPDATE MEMBERS ERROR:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const getCommissionMembers = async (req, res) => {
  try {
    const ideaId = req.params.id;

    const commission = await sql`
      SELECT user_id 
      FROM commission_members cm
      JOIN commissions c ON c.id = cm.commission_id
      WHERE c.idea_id = ${ideaId}
    `;

    return res.json({ message: "Success", members: commission.map(c => c.user_id) });
  } catch (error) {
    console.error("GET COMMISSION MEMBERS ERROR:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const getIdeaResponsibles = async (req, res) => {
  try {
    const ideaId = Number(req.params.id);
    if (!Number.isInteger(ideaId)) {
      return res.status(400).json({ message: "Invalid idea id" });
    }

    const rows = await sql`
      SELECT 
        ir.id,
        ir.idea_id,
        ir.user_id,
        ir.role,
        ir.created_at,
        ir.created_by,
        u.name,
        u.surname,
        u.email
      FROM idea_responsibles ir
      JOIN users u ON u.id = ir.user_id
      WHERE ir.idea_id = ${ideaId}
      ORDER BY ir.id
    `;

    return res.json({ message: "Success", responsibles: rows });
  } catch (e) {
    console.error("GET IDEA RESPONSIBLES ERROR:", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const saveIdeaResponsibles = async (req, res) => {
  try {
    const ideaId = Number(req.params.id);
    const createdBy = req.user?.id || 1;

    if (!Number.isInteger(ideaId)) {
      return res.status(400).json({ message: "Invalid idea id" });
    }

    const { responsibles } = req.body;
    if (!Array.isArray(responsibles)) {
      return res.status(400).json({ message: "Invalid responsibles format" });
    }

    const normalized = responsibles
      .map((r) => {
        if (typeof r === "number" || typeof r === "string") {
          const user_id = Number(r);
          return Number.isInteger(user_id) ? { user_id, role: null } : null;
        }
        const user_id = Number(r?.user_id);
        if (!Number.isInteger(user_id)) return null;
        return { user_id, role: r?.role ?? null };
      })
      .filter(Boolean);

    const map = new Map();
    for (const x of normalized) map.set(x.user_id, x);
    const unique = [...map.values()];

    const existingRows = await sql`
      SELECT user_id
      FROM idea_responsibles
      WHERE idea_id = ${ideaId}
    `;
    const existingIds = existingRows.map((r) => Number(r.user_id)).filter(Number.isInteger);
    const existingSet = new Set(existingIds);

    const newResponsibleIds = unique
      .map((r) => Number(r.user_id))
      .filter(Number.isInteger)
      .filter((uid) => !existingSet.has(uid));

    await sql.begin(async (trx) => {
      await trx`DELETE FROM idea_responsibles WHERE idea_id = ${ideaId}`;

      for (const r of unique) {
        await trx`
          INSERT INTO idea_responsibles (idea_id, user_id, role, created_by)
          VALUES (${ideaId}, ${r.user_id}, ${r.role}, ${createdBy})
        `;
      }
    });

    if (newResponsibleIds.length > 0) {
      try {
        await notifyIdeaResponsiblesAssigned({
          ideaId,
          userIds: newResponsibleIds,
        });
      } catch (mailErr) {
        console.error("notifyIdeaResponsiblesAssigned ERROR:", mailErr);
      }
    }

    return res.json({ message: "Responsibles saved" });
  } catch (e) {
    console.error("SAVE IDEA RESPONSIBLES ERROR:", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const getCommissionPeople = async (req, res) => {
  try {
    const ideaId = Number(req.params.id);
    if (!Number.isInteger(ideaId)) {
      return res.status(400).json({ message: "Invalid idea id" });
    }

    const rows = await sql`
      SELECT DISTINCT
        u.id,
        u.name,
        u.surname,
        u.email,
        u.role_id,
        u.department_id
      FROM users u
      JOIN idea_departments idp ON idp.department_id = u.department_id
      WHERE idp.idea_id = ${ideaId}
      ORDER BY u.surname ASC, u.name ASC
    `;

    return res.json({ message: "Success", result: rows });
  } catch (e) {
    console.error("getCommissionPeople ERROR:", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const getCommissionSpecificMembers = async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const commisionId = Number(req.params.commisionId);

    if (!userId || !commisionId) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (!Number.isInteger(userId) || !Number.isInteger(commisionId)) {
      return res.status(400).json({ message: "Invalid field types" });
    }

    const supervisorRows = await sql`
      SELECT id, name, surname
      FROM users
      WHERE supervisor = ${userId} OR role_id = 4
    `;

    return res.status(200).json({ message: "Success", users: supervisorRows });
  } catch (e) {
    console.error("Error during fetching specific members in commision", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const resolveUsersByIds = async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];

    const userIds = [...new Set(ids)]
      .map((x) => Number(x))
      .filter((x) => Number.isInteger(x) && x > 0);

    if (userIds.length === 0) {
      return res.status(400).json({ message: "ids[] is required" });
    }

    const rows = await sql`
      SELECT id, name, surname
      FROM users
      WHERE id = ANY(${sql.array(userIds)}::int4[])
      ORDER BY surname, name
    `;

    return res.status(200).json({ message: "Success", users: rows });
  } catch (e) {
    console.error("resolveUsersByIds ERROR:", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const getCommissionChairman = async (req, res) => {
  try {
    const ideaId = Number(req.params.id);

    if (!Number.isInteger(ideaId)) {
      return res.status(400).json({ message: "Invalid idea id" });
    }

    const rows = await sql`
      SELECT
        c.id AS commission_id,
        c.chairman_user_id,
        u.id AS user_id,
        u.name,
        u.surname,
        u.email
      FROM commissions c
      LEFT JOIN users u ON u.id = c.chairman_user_id
      WHERE c.idea_id = ${ideaId}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return res.status(404).json({ message: "Commission not found" });
    }

    const row = rows[0];

    return res.json({
      message: "Success",
      commissionId: row.commission_id,
      chairman: row.chairman_user_id
        ? {
            id: row.user_id,
            user_id: row.user_id,
            name: row.name,
            surname: row.surname,
            email: row.email,
          }
        : null,
    });
  } catch (error) {
    console.error("GET COMMISSION CHAIRMAN ERROR:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const setCommissionChairman = async (req, res) => {
  try {
    const ideaId = Number(req.params.id);
    const chairmanUserId = Number(req.body?.chairmanUserId);
    const byUserId = req.user?.id;

    if (!Number.isInteger(ideaId)) {
      return res.status(400).json({ message: "Invalid idea id" });
    }

    if (!Number.isInteger(chairmanUserId)) {
      return res.status(400).json({ message: "Invalid chairman user id" });
    }

    const commissionRows = await sql`
      SELECT id
      FROM commissions
      WHERE idea_id = ${ideaId}
      LIMIT 1
    `;

    if (commissionRows.length === 0) {
      return res.status(404).json({ message: "Commission not found" });
    }

    const commissionId = Number(commissionRows[0].id);

    // walidacja: przewodniczący musi być członkiem komisji
    const memberRows = await sql`
      SELECT 1
      FROM commission_members
      WHERE commission_id = ${commissionId}
        AND user_id = ${chairmanUserId}
      LIMIT 1
    `;

    if (memberRows.length === 0) {
      return res.status(400).json({ message: "Selected user is not a commission member" });
    }

    await sql`
      UPDATE commissions
      SET chairman_user_id = ${chairmanUserId}
      WHERE id = ${commissionId}
    `;

    try {
      await sql`
        INSERT INTO idea_workflow_log (idea_id, step, action, by_user, description)
        VALUES (
          ${ideaId},
          'commission',
          'chairman_set',
          ${byUserId || null},
          ${`Chairman set to user #${chairmanUserId}`}
        )
      `;
    } catch (logErr) {
      console.error("Chairman workflow log insert error:", logErr);
    }

    const userRows = await sql`
      SELECT id, name, surname, email
      FROM users
      WHERE id = ${chairmanUserId}
      LIMIT 1
    `;

    try {
      await notifyCommissionChairmanAssigned({
        ideaId,
        chairmanUserId,
        assignedByUserId: byUserId || null,
      });
    } catch (mailErr) {
      console.error("notifyCommissionChairmanAssigned ERROR:", mailErr);
    }
    return res.json({
      message: "Chairman set successfully",
      commissionId,
      chairman: userRows[0] || { id: chairmanUserId },
    });
  } catch (error) {
    console.error("SET COMMISSION CHAIRMAN ERROR:", error);
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
  updateCommissionMembers,
  getCommissionMembers,
  getIdeaResponsibles,
  saveIdeaResponsibles,
  getCommissionPeople,
  getCommissionSpecificMembers,
  resolveUsersByIds,
  getCommissionChairman,
  setCommissionChairman,
};
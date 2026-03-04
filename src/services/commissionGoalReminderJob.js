const sql = require("../controllers/db");
const {
  notifyCommissionGoalDeadlineReminder,
} = require("./ideaNotificationService");

const DAY_MS = 24 * 60 * 60 * 1000;

const uniqByEmail = (rows = []) => {
  const map = new Map();
  for (const r of rows) {
    const email = String(r?.email || "").trim().toLowerCase();
    if (!email) continue;
    if (!map.has(email)) map.set(email, r);
  }
  return [...map.values()];
};

const getReminderTypeForDaysLeft = (daysLeft) => {
  if (daysLeft < 0) return "overdue";
  if (daysLeft === 7) return "7d";
  if (daysLeft === 3) return "3d";
  if (daysLeft === 1) return "1d";
  return null;
};

const wasReminderSent = async ({ goalId, email, reminderType }) => {
  const rows = await sql`
    SELECT id
    FROM commission_goal_reminder_logs
    WHERE goal_id = ${goalId}
      AND email = ${String(email).trim().toLowerCase()}
      AND reminder_type = ${reminderType}
    LIMIT 1
  `;
  return !!rows?.[0];
};

const saveReminderLog = async ({
  goalId,
  ideaId,
  userId = null,
  email,
  reminderType,
  meta = {},
}) => {
  await sql`
    INSERT INTO commission_goal_reminder_logs (
      goal_id,
      idea_id,
      user_id,
      email,
      reminder_type,
      meta
    )
    VALUES (
      ${goalId},
      ${ideaId},
      ${userId ? Number(userId) : null},
      ${String(email).trim().toLowerCase()},
      ${reminderType},
      ${JSON.stringify(meta)}
    )
    ON CONFLICT (goal_id, email, reminder_type) DO NOTHING
  `;
};

const getActiveGoalsWithAssignees = async () => {
  return await sql`
    SELECT
      cg.id AS goal_id,
      cg.idea_id,
      cg.goals AS goal_title,
      cg.steps AS goal_steps,
      cg.due_date,
      cg.is_done,
      cga.user_id,
      u.email,
      u.name,
      u.surname
    FROM commission_goals cg
    JOIN commission_goal_assignees cga ON cga.goal_id = cg.id
    JOIN users u ON u.id = cga.user_id
    WHERE cg.due_date IS NOT NULL
      AND cg.is_done = false
      AND cg.due_date <= (CURRENT_DATE + INTERVAL '8 days')
    ORDER BY cg.due_date ASC, cg.id ASC
  `;
};

const runCommissionGoalReminderJob = async () => {
  const startedAt = new Date();
  console.log("[commissionGoalReminderJob] START", startedAt.toISOString());

  try {
    const rows = await getActiveGoalsWithAssignees();
    if (!rows.length) {
      console.log("[commissionGoalReminderJob] No matching goals");
      return {
        ok: true,
        processedGoals: 0,
        sent: 0,
      };
    }

    const goalsMap = new Map();

    for (const r of rows) {
      if (!goalsMap.has(r.goal_id)) {
        goalsMap.set(r.goal_id, {
          goal_id: r.goal_id,
          idea_id: r.idea_id,
          goal_title: r.goal_title,
          goal_steps: r.goal_steps,
          due_date: r.due_date,
          recipients: [],
        });
      }

      goalsMap.get(r.goal_id).recipients.push({
        user_id: r.user_id,
        email: r.email,
        name: r.name,
        surname: r.surname,
      });
    }

    let processedGoals = 0;
    let sentCount = 0;

    for (const goal of goalsMap.values()) {
      processedGoals++;

      const due = new Date(goal.due_date);
      const today = new Date();
      const todayAtMidnight = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate()
      );
      const dueAtMidnight = new Date(
        due.getFullYear(),
        due.getMonth(),
        due.getDate()
      );

      const diffMs = dueAtMidnight.getTime() - todayAtMidnight.getTime();
      const daysLeft = Math.round(diffMs / DAY_MS); 
      const reminderType = getReminderTypeForDaysLeft(daysLeft);

      if (!reminderType) continue;

      const uniqueRecipients = uniqByEmail(goal.recipients);
      if (!uniqueRecipients.length) continue;

      const recipientsToSend = [];
      for (const r of uniqueRecipients) {
        const alreadySent = await wasReminderSent({
          goalId: goal.goal_id,
          email: r.email,
          reminderType,
        });
        if (!alreadySent) recipientsToSend.push(r);
      }

      if (!recipientsToSend.length) continue;

      const results = await notifyCommissionGoalDeadlineReminder({
        ideaId: goal.idea_id,
        goalId: goal.goal_id,
        goalTitle: goal.goal_title,
        goalSteps: goal.goal_steps,
        dueDate: goal.due_date,
        recipients: recipientsToSend,
        reminderType,
        daysLeft,
      });

      for (const res of results) {
        if (!res?.ok) continue;

        const matchingUser = recipientsToSend.find(
          (u) => String(u.email).toLowerCase() === String(res.email).toLowerCase()
        );

        await saveReminderLog({
          goalId: goal.goal_id,
          ideaId: goal.idea_id,
          userId: matchingUser?.user_id ?? null,
          email: res.email,
          reminderType,
          meta: {
            daysLeft,
            dueDate: goal.due_date,
          },
        });

        sentCount++;
      }
    }

    console.log("[commissionGoalReminderJob] DONE", {
      processedGoals,
      sentCount,
    });

    return {
      ok: true,
      processedGoals,
      sent: sentCount,
    };
  } catch (error) {
    console.error("[commissionGoalReminderJob] ERROR:", error);
    return {
      ok: false,
      error: error?.message || "Unknown error",
    };
  }
};

module.exports = {
  runCommissionGoalReminderJob,
};
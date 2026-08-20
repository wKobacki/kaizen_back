const sql = require("../controllers/db");
const { sendMailViaGraph } = require("../controllers/mailerController");

const uniqByEmail = (rows = []) => {
  const map = new Map();

  for (const r of rows) {
    const email = String(r?.email || "")
      .trim()
      .toLowerCase();

    if (!email) continue;

    if (!map.has(email)) {
      map.set(email, r);
    }
  }

  return [...map.values()];
};

const safeName = (u) => {
  const full = `${u?.name || ""} ${u?.surname || ""}`.trim();

  return full || u?.email || "User";
};

const toIdeaNo = (idea) => String(idea?.id ?? "");

const getIdeaCore = async (ideaId, trx = sql) => {
  const rows = await trx`
    SELECT
      i.id,
      i.title,
      i.user_id,
      i.department_id,
      i.status_id,
      i.current_step,
      u.email AS author_email,
      u.name AS author_name,
      u.surname AS author_surname

    FROM ideas i

    JOIN users u
      ON u.id = i.user_id

    WHERE i.id = ${ideaId}

    LIMIT 1
  `;

  return rows?.[0] || null;
};

const getUserById = async (userId, trx = sql) => {
  const rows = await trx`
    SELECT
      id,
      email,
      name,
      surname,
      role_id,
      department_id

    FROM users

    WHERE id = ${userId}

    LIMIT 1
  `;

  return rows?.[0] || null;
};

const getUsersByIds = async (
  userIds = [],
  trx = sql
) => {
  const ids = [
    ...new Set(
      (Array.isArray(userIds) ? userIds : [])
        .map(Number)
        .filter(Number.isInteger)
    ),
  ];

  if (!ids.length) {
    return [];
  }

  const rows = await trx`
    SELECT
      id AS user_id,
      email,
      name,
      surname,
      role_id,
      department_id

    FROM users

    WHERE id IN ${trx(ids)}
  `;

  return rows;
};

const getDepartmentHeadsForIdea = async (
  ideaId,
  trx = sql
) => {
  const rows = await trx`
    SELECT DISTINCT
      d.id AS department_id,
      d.name AS department_name,
      u.id AS user_id,
      u.email,
      u.name,
      u.surname

    FROM idea_departments idp

    JOIN departments d
      ON d.id = idp.department_id

    JOIN users u
      ON u.id = d.supervisor_user_id

    WHERE idp.idea_id = ${ideaId}
      AND d.supervisor_user_id IS NOT NULL
  `;

  return rows;
};

const getCommissionMembersByIdea = async (
  ideaId,
  trx = sql
) => {
  const rows = await trx`
    SELECT DISTINCT
      u.id AS user_id,
      u.email,
      u.name,
      u.surname

    FROM commissions c

    JOIN commission_members cm
      ON cm.commission_id = c.id

    JOIN users u
      ON u.id = cm.user_id

    WHERE c.idea_id = ${ideaId}
  `;

  return rows;
};

const getSpecificCommissionMembersByIds = async (
  ideaId,
  userIds = [],
  trx = sql
) => {
  const ids = [
    ...new Set(
      userIds
        .map(Number)
        .filter(Number.isInteger)
    ),
  ];

  if (!ids.length) {
    return [];
  }

  const rows = await trx`
    SELECT DISTINCT
      u.id AS user_id,
      u.email,
      u.name,
      u.surname

    FROM commissions c

    JOIN commission_members cm
      ON cm.commission_id = c.id

    JOIN users u
      ON u.id = cm.user_id

    WHERE c.idea_id = ${ideaId}
      AND u.id IN ${trx(ids)}
  `;

  return rows;
};

const getDepartmentById = async (
  departmentId,
  trx = sql
) => {
  const rows = await trx`
    SELECT
      id,
      name,
      supervisor_user_id

    FROM departments

    WHERE id = ${departmentId}

    LIMIT 1
  `;

  return rows?.[0] || null;
};

const getStatusNameById = async (
  statusId,
  trx = sql
) => {
  if (!statusId) {
    return null;
  }

  const rows = await trx`
    SELECT name
    FROM status
    WHERE id = ${statusId}
    LIMIT 1
  `;

  return rows?.[0]?.name || null;
};

const sendMailSafe = async ({
  to,
  subject,
  text,
}) => {
  try {
    await sendMailViaGraph({
      to,
      subject,
      text,
    });

    return {
      ok: true,
    };
  } catch (e) {
    console.error(
      "[ideaNotificationService] sendMailSafe ERROR:",
      {
        to,
        subject,
        message: e?.message,
        response: e?.response?.data,
      }
    );

    return {
      ok: false,
      error: e,
    };
  }
};

const sendBulkPersonalized = async (
  recipients,
  buildMessage
) => {
  const unique = uniqByEmail(recipients);
  const results = [];

  for (const r of unique) {
    const msg = buildMessage(r);

    if (
      !msg?.to ||
      !msg?.subject ||
      !msg?.text
    ) {
      continue;
    }

    const res = await sendMailSafe(msg);

    results.push({
      email: r.email,
      ok: res.ok,
    });
  }

  return results;
};

const notifySupervisorApproved = async ({
  ideaId,
}) => {
  const idea = await getIdeaCore(ideaId);

  if (!idea?.author_email) {
    return;
  }

  const subject =
    `Twój pomysł #${toIdeaNo(idea)} zmienił status`;

  const text = [
    `Cześć ${safeName({
      name: idea.author_name,
      surname: idea.author_surname,
      email: idea.author_email,
    })},`,
    "",
    `Twój pomysł o numerze ${idea.id} („${idea.title}”) został zaakceptowany przez przełożonego.`,
    "Pomysł został przekazany do dalszej akceptacji działów.",
  ].join("\n");

  await sendMailSafe({
    to: idea.author_email,
    subject,
    text,
  });
};

const notifySupervisorRejected = async ({
  ideaId,
  reason,
}) => {
  const idea = await getIdeaCore(ideaId);

  if (!idea?.author_email) {
    return;
  }

  const subject =
    `Twój pomysł #${toIdeaNo(idea)} został odrzucony`;

  const text = [
    `Cześć ${safeName({
      name: idea.author_name,
      surname: idea.author_surname,
      email: idea.author_email,
    })},`,
    "",
    `Twój pomysł o numerze ${idea.id} („${idea.title}”) został odrzucony przez przełożonego.`,
    reason
      ? `Powód: ${reason}`
      : "Powód nie został podany.",
  ].join("\n");

  await sendMailSafe({
    to: idea.author_email,
    subject,
    text,
  });
};

const notifyDepartmentsAssigned = async ({
  ideaId,
}) => {
  const idea = await getIdeaCore(ideaId);

  if (!idea) {
    return;
  }

  if (idea.author_email) {
    const statusName =
      await getStatusNameById(
        idea.current_step ||
        idea.status_id
      ).catch(() => null);

    const subject =
      `Twój pomysł #${idea.id} został przekazany do działów`;

    const text = [
      `Cześć ${safeName({
        name: idea.author_name,
        surname: idea.author_surname,
        email: idea.author_email,
      })},`,
      "",
      `Twój pomysł o numerze ${idea.id} („${idea.title}”) został przekazany do akceptacji działów.`,
      statusName
        ? `Aktualny status/etap: ${statusName}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    await sendMailSafe({
      to: idea.author_email,
      subject,
      text,
    });
  }

  const headRows =
    await getDepartmentHeadsForIdea(ideaId);

  const groupedHeads = new Map();

  for (const head of headRows) {
    const email = String(
      head?.email || ""
    )
      .trim()
      .toLowerCase();

    if (!email) {
      continue;
    }

    if (!groupedHeads.has(email)) {
      groupedHeads.set(email, {
        user_id: head.user_id,
        email: head.email,
        name: head.name,
        surname: head.surname,
        departments: [],
      });
    }

    const grouped =
      groupedHeads.get(email);

    const departmentId =
      Number(head.department_id);

    const alreadyAdded =
      grouped.departments.some(
        (department) =>
          Number(department.id) ===
          departmentId
      );

    if (!alreadyAdded) {
      grouped.departments.push({
        id: departmentId,
        name: head.department_name,
      });
    }
  }

  const heads = [
    ...groupedHeads.values(),
  ];

  await sendBulkPersonalized(
    heads,
    (head) => {
      const departments = [
        ...head.departments,
      ].sort((a, b) =>
        String(a.name || "").localeCompare(
          String(b.name || ""),
          "pl"
        )
      );

      const departmentNames =
        departments
          .map(
            (department) =>
              department.name ||
              `#${department.id}`
          )
          .filter(Boolean);

      const singleDepartment =
        departmentNames.length === 1;

      const subject =
        singleDepartment
          ? `Dział ${departmentNames[0]} ma pomysł do akceptacji (#${idea.id})`
          : `Masz pomysł do akceptacji w ${departmentNames.length} działach (#${idea.id})`;

      const departmentLines =
        singleDepartment
          ? [
              `Twój dział (${departmentNames[0]}) ma do akceptacji pomysł o numerze ${idea.id}.`,
            ]
          : [
              `Działy, za które odpowiadasz, mają do akceptacji pomysł o numerze ${idea.id}:`,
              ...departmentNames.map(
                (name) => `- ${name}`
              ),
            ];

      return {
        to: head.email,
        subject,
        text: [
          `Cześć ${safeName(head)},`,
          "",
          ...departmentLines,
          `Tytuł pomysłu: ${idea.title}`,
          "",
          "Zaloguj się do systemu, aby podjąć decyzję osobno dla każdego przypisanego działu.",
        ].join("\n"),
      };
    }
  );
};

const notifyDepartmentDecision = async ({
  ideaId,
  departmentId,
  action,
  reason,
}) => {
  const idea = await getIdeaCore(ideaId);

  if (!idea?.author_email) {
    return;
  }

  const dept =
    await getDepartmentById(
      Number(departmentId)
    );

  const deptName =
    dept?.name ||
    `#${departmentId}`;

  const actionNorm = String(
    action || ""
  ).toLowerCase();

  const isReject =
    actionNorm === "reject";

  const actionLabel =
    isReject
      ? "odrzucił"
      : "zaakceptował";

  const subject =
    isReject
      ? `Pomysł #${idea.id} został odrzucony przez dział ${deptName}`
      : `Pomysł #${idea.id} został zaakceptowany przez dział ${deptName}`;

  const text = [
    `Cześć ${safeName({
      name: idea.author_name,
      surname: idea.author_surname,
      email: idea.author_email,
    })},`,
    "",
    `Dział ${deptName} ${actionLabel} Twój pomysł o numerze ${idea.id} („${idea.title}”).`,
    isReject && reason
      ? `Powód odrzucenia: ${reason}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  await sendMailSafe({
    to: idea.author_email,
    subject,
    text,
  });
};

const notifyCommissionCreated = async ({
  ideaId,
  memberIds = null,
  source = "manual",
}) => {
  const idea =
    await getIdeaCore(ideaId);

  if (!idea) {
    return;
  }

  if (idea.author_email) {
    const subject =
      `Twój pomysł #${idea.id} przeszedł do komisji`;

    const text = [
      `Cześć ${safeName({
        name: idea.author_name,
        surname: idea.author_surname,
        email: idea.author_email,
      })},`,
      "",
      `Dla pomysłu o numerze ${idea.id} („${idea.title}”) utworzono komisję.`,
      source === "auto"
        ? "Komisja została utworzona automatycznie po akceptacji działów."
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    await sendMailSafe({
      to: idea.author_email,
      subject,
      text,
    });
  }

  let members = [];

  if (
    Array.isArray(memberIds) &&
    memberIds.length > 0
  ) {
    const ids = [
      ...new Set(
        memberIds
          .map(Number)
          .filter(Number.isInteger)
      ),
    ];

    if (ids.length) {
      const rows = await sql`
        SELECT
          id AS user_id,
          email,
          name,
          surname

        FROM users

        WHERE id IN ${sql(ids)}
      `;

      members = rows;
    }
  } else {
    members =
      await getCommissionMembersByIdea(
        ideaId
      );
  }

  await sendBulkPersonalized(
    members,
    (m) => ({
      to: m.email,
      subject:
        `Dodano Cię do komisji (pomysł #${idea.id})`,
      text: [
        `Cześć ${safeName(m)},`,
        "",
        `Zostałeś/Zostałaś dodany(a) do komisji w pomyśle o numerze ${idea.id}.`,
        `Tytuł pomysłu: ${idea.title}`,
        "",
        "Zaloguj się do systemu, aby zobaczyć szczegóły.",
      ].join("\n"),
    })
  );
};

const notifyCommissionMembersAdded = async ({
  ideaId,
  userIds = [],
}) => {
  const idea =
    await getIdeaCore(ideaId);

  if (!idea) {
    return;
  }

  const members =
    await getUsersByIds(userIds);

  if (!members.length) {
    return;
  }

  await sendBulkPersonalized(
    members,
    (m) => ({
      to: m.email,
      subject:
        `Dodano Cię do komisji (pomysł #${idea.id})`,
      text: [
        `Cześć ${safeName(m)},`,
        "",
        `Zostałeś/Zostałaś dodany(a) do komisji w pomyśle o numerze ${idea.id}.`,
        `Tytuł pomysłu: ${idea.title}`,
        "",
        "Zaloguj się do systemu, aby zobaczyć szczegóły.",
      ].join("\n"),
    })
  );
};

const notifyIdeaResponsiblesAssigned = async ({
  ideaId,
  userIds = [],
}) => {
  const idea =
    await getIdeaCore(ideaId);

  if (!idea) {
    return;
  }

  const responsibles =
    await getUsersByIds(userIds);

  if (!responsibles.length) {
    return;
  }

  await sendBulkPersonalized(
    responsibles,
    (u) => ({
      to: u.email,
      subject:
        `Dodano Cię jako osobę odpowiedzialną (pomysł #${idea.id})`,
      text: [
        `Cześć ${safeName(u)},`,
        "",
        `Zostałeś/Zostałaś dodany(a) jako osoba odpowiedzialna za pomysł o numerze ${idea.id}.`,
        `Tytuł pomysłu: ${idea.title}`,
        "",
        "Zaloguj się do systemu, aby zobaczyć szczegóły i działania do wykonania.",
        "",
      ].join("\n"),
    })
  );
};

const notifyIdeaCompleted = async ({
  ideaId,
}) => {
  const idea =
    await getIdeaCore(ideaId);

  if (!idea?.author_email) {
    return;
  }

  const subject =
    `Twój pomysł #${idea.id} został zakończony`;

  const text = [
    `Cześć ${safeName({
      name: idea.author_name,
      surname: idea.author_surname,
      email: idea.author_email,
    })},`,
    "",
    `Twój pomysł o numerze ${idea.id} („${idea.title}”) został oznaczony jako zrealizowany/zakończony.`,
  ].join("\n");

  await sendMailSafe({
    to: idea.author_email,
    subject,
    text,
  });
};

const notifyCommissionChairmanAssigned = async ({
  ideaId,
  chairmanUserId,
  assignedByUserId = null,
}) => {
  const idea =
    await getIdeaCore(ideaId);

  if (!idea) {
    return;
  }

  const chairman =
    await getUserById(
      Number(chairmanUserId)
    );

  if (!chairman?.email) {
    return;
  }

  const assignedBy =
    Number.isInteger(
      Number(assignedByUserId)
    ) &&
    Number(assignedByUserId) > 0
      ? await getUserById(
          Number(assignedByUserId)
        ).catch(() => null)
      : null;

  const subject =
    `Wyznaczono Cię na przewodniczącego komisji (pomysł #${idea.id})`;

  const text = [
    `Cześć ${safeName(chairman)},`,
    "",
    `Zostałeś/Zostałaś wyznaczony(a) na przewodniczącego komisji dla pomysłu o numerze ${idea.id}.`,
    `Tytuł pomysłu: ${idea.title}`,
    assignedBy
      ? `Osoba przypisująca: ${safeName(assignedBy)}`
      : "",
    "",
    "Zaloguj się do systemu, aby zobaczyć szczegóły komisji.",
  ]
    .filter(Boolean)
    .join("\n");

  await sendMailSafe({
    to: chairman.email,
    subject,
    text,
  });

  if (idea.author_email) {
    const authorSubject =
      `Dla pomysłu #${idea.id} wyznaczono przewodniczącego komisji`;

    const authorText = [
      `Cześć ${safeName({
        name: idea.author_name,
        surname: idea.author_surname,
        email: idea.author_email,
      })},`,
      "",
      `Dla Twojego pomysłu o numerze ${idea.id} („${idea.title}”) wyznaczono przewodniczącego komisji.`,
      `Przewodniczący: ${safeName(chairman)}`,
    ].join("\n");

    await sendMailSafe({
      to: idea.author_email,
      subject: authorSubject,
      text: authorText,
    });
  }
};

const notifyCommissionGoalDeadlineReminder = async ({
  ideaId,
  goalId,
  goalTitle,
  goalSteps,
  dueDate,
  recipients = [],
  reminderType,
  daysLeft = null,
}) => {
  const idea =
    await getIdeaCore(ideaId);

  if (!idea) {
    return [];
  }

  const dueDateText =
    dueDate
      ? new Date(
          dueDate
        ).toLocaleDateString("pl-PL")
      : "brak";

  const reminderLine =
    reminderType === "overdue"
      ? "Termin realizacji tego kroku został przekroczony."
      : `Do terminu realizacji pozostało ${daysLeft} ${
          daysLeft === 1
            ? "dzień"
            : "dni"
        }.`;

  return await sendBulkPersonalized(
    recipients,
    (u) => ({
      to: u.email,
      subject:
        reminderType === "overdue"
          ? `Przekroczony termin kroku (pomysł #${idea.id})`
          : `Przypomnienie o terminie kroku (pomysł #${idea.id})`,
      text: [
        `Cześć ${safeName(u)},`,
        "",
        `Przypomnienie dotyczące pomysłu #${idea.id}.`,
        `Tytuł pomysłu: ${idea.title}`,
        `Krok (cel): ${
          goalTitle ||
          `#${goalId}`
        }`,
        goalSteps
          ? `Opis kroków: ${goalSteps}`
          : "",
        `Termin (due_date): ${dueDateText}`,
        reminderLine,
        "",
        "Zaloguj się do systemu, aby sprawdzić szczegóły i zaktualizować status kroku.",
      ]
        .filter(Boolean)
        .join("\n"),
    })
  );
};

const notifySupervisorNewIdea = async ({
  ideaId,
}) => {
  /*
    Pierwszy etap akceptacji korzysta z
    users.supervisor autora pomysłu.

    departments.supervisor_user_id nie jest tutaj
    używany do wyznaczania akceptanta.
  */
  const rows = await sql`
    SELECT
      i.id AS idea_id,
      i.title AS idea_title,

      author.id AS author_id,
      author.name AS author_name,
      author.surname AS author_surname,
      author.email AS author_email,
      author.supervisor AS author_supervisor_id,

      d.id AS department_id,
      d.name AS department_name,

      supervisor.id AS supervisor_id,
      supervisor.name AS supervisor_name,
      supervisor.surname AS supervisor_surname,
      supervisor.email AS supervisor_email

    FROM ideas i

    JOIN users author
      ON author.id = i.user_id

    LEFT JOIN departments d
      ON d.id = author.department_id

    LEFT JOIN users supervisor
      ON supervisor.id = author.supervisor

    WHERE i.id = ${ideaId}

    LIMIT 1
  `;

  const data = rows?.[0];

  if (!data) {
    console.warn(
      `[notifySupervisorNewIdea] Idea ${ideaId} not found`
    );

    return;
  }

  /*
    Jeżeli autor nie ma przypisanego przełożonego,
    nie wysyłamy powiadomienia.
  */
  if (!data.supervisor_email) {
    console.warn(
      "[notifySupervisorNewIdea] No supervisor assigned for idea author",
      {
        ideaId,
        authorId: data.author_id,
        departmentId:
          data.department_id,
        supervisorId:
          data.author_supervisor_id,
      }
    );

    return;
  }

  const authorName =
    `${data.author_name || ""} ${
      data.author_surname || ""
    }`.trim() ||
    data.author_email;

  const supervisorName =
    `${data.supervisor_name || ""} ${
      data.supervisor_surname || ""
    }`.trim() ||
    data.supervisor_email;

  const subject =
    `Nowy pomysł do akceptacji (#${data.idea_id})`;

  const text = [
    `Cześć ${supervisorName},`,
    "",
    `${authorName} utworzył(a) nowy pomysł wymagający Twojej akceptacji.`,
    "",
    `Numer pomysłu: ${data.idea_id}`,
    `Tytuł: ${data.idea_title}`,
    data.department_name
      ? `Dział autora: ${data.department_name}`
      : "",
    "",
    "Zaloguj się do systemu, aby zapoznać się z pomysłem i podjąć decyzję.",
  ]
    .filter(Boolean)
    .join("\n");

  const result =
    await sendMailSafe({
      to: data.supervisor_email,
      subject,
      text,
    });

  if (result?.ok) {
    console.log(
      "[notifySupervisorNewIdea] Mail sent",
      {
        ideaId:
          data.idea_id,

        authorId:
          data.author_id,

        supervisorId:
          data.supervisor_id,

        email:
          data.supervisor_email,
      }
    );
  }

  return result;
};

module.exports = {
  notifySupervisorNewIdea,
  notifySupervisorApproved,
  notifySupervisorRejected,
  notifyDepartmentsAssigned,
  notifyDepartmentDecision,
  notifyCommissionCreated,
  notifyCommissionMembersAdded,
  notifyIdeaResponsiblesAssigned,
  notifyIdeaCompleted,
  notifyCommissionChairmanAssigned,
  notifyCommissionGoalDeadlineReminder,
};
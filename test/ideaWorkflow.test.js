const assert = require("node:assert/strict");
const path = require("node:path");
const { beforeEach, test } = require("node:test");

const state = {};
const notificationCalls = {
  departmentDecision: 0,
  commissionSelection: [],
  commissionCreated: 0,
};

const resetState = ({
  departments = [
    { department_id: 10, status_id: 1, supervisor_user_id: 20 },
    { department_id: 11, status_id: 1, supervisor_user_id: 21 },
  ],
  supervisorId = 90,
  currentStep = 1,
  commission = null,
} = {}) => {
  Object.assign(state, {
    departments: departments.map((department) => ({ ...department })),
    supervisorId,
    currentStep,
    ideaStatus: currentStep,
    commission,
    commissionId: 55,
    memberIds: [],
    goalAssignees: new Set([30]),
    goalStatus: false,
    goals: [{
      id: 70,
      title: "Test goal",
      assigned_to: [30],
      is_done: false,
    }],
    users: new Set([30, 31, 90]),
    statuses: new Map([
      ["department_review", 1],
      ["department_approved", 2],
      ["department_rejected", 3],
      ["commission_created", 4],
      ["awaiting_commission_selection", 5],
    ]),
  });
  notificationCalls.departmentDecision = 0;
  notificationCalls.commissionSelection = [];
  notificationCalls.commissionCreated = 0;
};

const fakeSql = (strings, ...values) => {
  if (Array.isArray(strings) && typeof strings[0] !== "string") {
    return { __sqlValues: strings };
  }
  const query = strings.join(" ").replace(/\s+/g, " ").trim().toLowerCase();
  const unwrap = (value) => value?.__sqlValues ?? value;

  if (query.includes("from status where name")) {
    const id = state.statuses.get(String(values[0]));
    return id ? [{ id }] : [];
  }
  if (query.startsWith("insert into status")) {
    const id = 5;
    state.statuses.set(String(values[0]), id);
    return [{ id }];
  }
  if (query.includes("select pg_advisory_xact_lock")) return [];
  if (query.includes("current_status.name as current_step_name")) {
    const currentStepName = [...state.statuses.entries()]
      .find(([, id]) => Number(id) === Number(state.currentStep))?.[0];
    return [{
      id: 42,
      current_step_name: currentStepName,
      supervisor_id: state.supervisorId,
    }];
  }
  if (query.includes("from idea_departments d") && query.includes("s.name as status_name")) {
    const statusNames = new Map([...state.statuses.entries()].map(([name, id]) => [id, name]));
    return state.departments.map((department) => ({
      id: department.department_id,
      department_id: department.department_id,
      status_id: department.status_id,
      status_name: statusNames.get(department.status_id),
      is_responsible: department.supervisor_user_id === Number(values[1]),
      can_decide: state.currentStep === 1 && department.status_id === 1,
    }));
  }

  if (query.includes("from idea_departments idp") && query.includes("join ideas i")) {
    const department = state.departments.find(
      (row) => row.department_id === Number(values[0]) ||
        row.department_id === Number(values[1])
    );
    if (!department) return [];
    return [{
      id: department.department_id,
      status_id: department.status_id,
      department_id: department.department_id,
      department_name: `Department ${department.department_id}`,
      supervisor_user_id: department.supervisor_user_id,
      current_step: state.currentStep,
    }];
  }
  if (query.startsWith("update idea_departments")) {
    const departmentId = Number(values[4]);
    const department = state.departments.find((row) => row.department_id === departmentId);
    if (!department || department.status_id !== Number(values[5])) return [];
    department.status_id = Number(values[0]);
    return [{ id: departmentId }];
  }
  if (query.includes("select department_id, status_id from idea_departments")) {
    return state.departments.map(({ department_id, status_id }) => ({ department_id, status_id }));
  }
  if (query.includes("select status_id from idea_departments")) {
    return state.departments.map(({ status_id }) => ({ status_id }));
  }
  if (query.includes("from commissions") && query.includes("where idea_id")) {
    return state.commission ? [state.commission] : [];
  }
  if (
    (query.includes("from users author") && query.includes("author.supervisor")) ||
    query.startsWith("select author.supervisor as supervisor_id")
  ) {
    return [{ supervisor_id: state.supervisorId }];
  }
  if (query.startsWith("insert into commissions")) {
    state.commission = { id: state.commissionId, chairman_user_id: null };
    return [{ id: state.commissionId }];
  }
  if (query.startsWith("select id from users where id in")) {
    return unwrap(values.at(-1))
      .filter((id) => state.users.has(Number(id)))
      .map((id) => ({ id }));
  }
  if (query.startsWith("insert into commission_members")) {
    state.memberIds = unwrap(values.at(-1)).map((row) => Number(row[1]));
    return [];
  }
  if (query.startsWith("update ideas")) {
    state.ideaStatus = Number(values[0]);
    state.currentStep = Number(values[1]);
    return [];
  }
  if (query.includes("from ideas i") && query.includes("for update of i")) {
    return [{ id: Number(values[0]), supervisor_id: state.supervisorId }];
  }
  if (query.includes("from commissions") && query.includes("for update")) {
    return state.commission ? [state.commission] : [];
  }
  if (query.includes("from commission_goal_assignees cga")) {
    const requestedIds = unwrap(values.at(-1));
    const isAssignee = state.goalAssignees.has(Number(values[1]));
    return isAssignee && requestedIds.some((id) => Number(id) === 70) ? [{ 1: 1 }] : [];
  }
  if (query.includes("from commission_goal_assignees") && query.includes("where goal_id")) {
    return Number(values[1]) === 30 && state.goalAssignees.has(30) ? [{ 1: 1 }] : [];
  }
  if (query.includes("from commission_goals cg")) {
    return state.goals.map((goal) => ({ ...goal }));
  }
  if (query.includes("from commission_goals") && query.includes("where id")) {
    return [{ id: 70, goals: "Test goal", steps: "", is_done: state.goalStatus }];
  }
  if (query.startsWith("update commission_goals set is_done")) {
    state.goalStatus = Boolean(values[0]);
    return [];
  }
  if (query.startsWith("update commission_goals")) {
    return [];
  }
  if (query.includes("from commission_members") && query.includes("user_id")) {
    const userId = Number(values[1]);
    return state.memberIds.includes(userId) ? [{ 1: 1 }] : [];
  }
  if (query.includes("from ideas i") && query.includes("author.supervisor")) {
    return [{ user_id: 10, supervisor_id: state.supervisorId }];
  }
  if (query.includes("insert into idea_workflow_log")) return [];

  throw new Error(`Unhandled test SQL: ${query}`);
};
fakeSql.begin = async (callback) => callback(fakeSql);

const serviceStub = {
  notifySupervisorCommissionSelection: async (args) => {
    notificationCalls.commissionSelection.push(args);
    return { ok: true };
  },
  notifyDepartmentDecision: async () => {
    notificationCalls.departmentDecision++;
  },
  notifyCommissionCreated: async () => {
    notificationCalls.commissionCreated++;
  },
  notifyCommissionMembersAdded: async () => [],
  notifyCommissionGoalAssigned: async () => [],
  notifyCommissionGoalCompleted: async () => [],
  notifyIdeaCompleted: async () => {},
  notifyCommissionChairmanAssigned: async () => {},
  notifyIdeaResponsiblesAssigned: async () => {},
  notifyDepartmentsAssigned: async () => {},
  notifySupervisorNewIdea: async () => {},
  notifySupervisorApproved: async () => {},
  notifySupervisorRejected: async () => {},
};

const dbPath = path.resolve(__dirname, "../src/controllers/db.js");
const servicePath = path.resolve(__dirname, "../src/services/ideaNotificationService.js");
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: fakeSql,
};
require.cache[servicePath] = {
  id: servicePath,
  filename: servicePath,
  loaded: true,
  exports: serviceStub,
};

const controller = require("../src/controllers/ideaController");
const { requireCommissionAccess } = require("../src/middleware/requireCommissionAccess");

beforeEach(() => resetState());

const invoke = async (handler, { userId = 20, roleId = 2, body = {} } = {}) => {
  const response = {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
  await handler(
    {
      params: { id: "42" },
      body,
      user: { id: userId, role_id: roleId, role_name: roleId === 1 ? "admin" : "user" },
      headers: {},
    },
    response
  );
  return response;
};

test("only the final department approval triggers commission-selection notification", async () => {
  const first = await invoke(controller.departmentDecision, {
    userId: 20,
    body: { department_id: 10, action: "approve" },
  });
  assert.equal(first.statusCode, 200);
  assert.equal(notificationCalls.commissionSelection.length, 0);

  const last = await invoke(controller.departmentDecision, {
    userId: 21,
    body: { department_id: 11, action: "approve" },
  });
  assert.equal(last.statusCode, 200);
  assert.equal(state.currentStep, 5);
  assert.equal(notificationCalls.commissionSelection.length, 1);
  assert.deepEqual(notificationCalls.commissionSelection[0], {
    ideaId: 42,
    supervisorId: 90,
  });

  const replay = await invoke(controller.departmentDecision, {
    userId: 21,
    body: { department_id: 11, action: "approve" },
  });
  assert.equal(replay.statusCode, 409);
  assert.equal(notificationCalls.commissionSelection.length, 1);
});

test("a department rejection does not request commission selection", async () => {
  const result = await invoke(controller.departmentDecision, {
    userId: 20,
    body: { department_id: 10, action: "reject", reason: "Not suitable" },
  });
  assert.equal(result.statusCode, 200);
  assert.equal(state.currentStep, 3);
  assert.equal(notificationCalls.commissionSelection.length, 0);
});

test("department status response identifies the supervisor and all-approved state", async () => {
  state.departments.forEach((department) => {
    department.status_id = 2;
  });
  state.currentStep = 5;

  const result = await invoke(controller.getIdeaDepartmentsShort, { userId: 90 });
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.access.isIdeaSupervisor, true);
  assert.equal(result.payload.access.allDepartmentsApproved, true);
  assert.deepEqual(
    result.payload.result.map((department) => department.status_name),
    ["department_approved", "department_approved"]
  );

  state.departments[1].status_id = 1;
  const pendingResult = await invoke(controller.getIdeaDepartmentsShort, { userId: 90 });
  assert.equal(pendingResult.payload.access.allDepartmentsApproved, false);
});

test("only the idea supervisor can create a commission, and only after all departments approve", async () => {
  const unauthorized = await invoke(controller.createCommission, {
    userId: 21,
    body: { members: [30] },
  });
  assert.equal(unauthorized.statusCode, 403);
  assert.equal(state.commission, null);

  const beforeApproval = await invoke(controller.createCommission, {
    userId: 90,
    body: { members: [30] },
  });
  assert.equal(beforeApproval.statusCode, 409);
  assert.equal(state.commission, null);

  state.departments.forEach((department) => {
    department.status_id = 2;
  });
  const created = await invoke(controller.createCommission, {
    userId: 90,
    body: { members: [30] },
  });
  assert.equal(created.statusCode, 200);
  assert.equal(state.commission.id, 55);
  assert.deepEqual(state.memberIds, [30]);
  assert.equal(notificationCalls.commissionCreated, 1);
});

test("commission roster management requires chairman or admin access", async () => {
  state.commission = { id: 55, chairman_user_id: 30 };
  state.memberIds = [30, 31];

  const runAccess = async (userId) => {
    let calledNext = false;
    const response = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json() { return this; },
    };
    await requireCommissionAccess({ mode: "manage-members" })(
      { params: { id: "42" }, user: { id: userId, role_id: 2 } },
      response,
      () => { calledNext = true; }
    );
    return { calledNext, statusCode: response.statusCode };
  };

  assert.deepEqual(await runAccess(31), { calledNext: false, statusCode: 403 });
  assert.deepEqual(await runAccess(30), { calledNext: true, statusCode: 200 });
});

test("only the idea supervisor can assign the first chairman", async () => {
  state.commission = { id: 55, chairman_user_id: null };
  state.memberIds = [30, 31];

  const runAccess = async (userId) => {
    let calledNext = false;
    const response = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json() { return this; },
    };
    await requireCommissionAccess({ mode: "manage-chairman" })(
      { params: { id: "42" }, user: { id: userId, role_id: 2 } },
      response,
      () => { calledNext = true; }
    );
    return { calledNext, statusCode: response.statusCode };
  };

  assert.deepEqual(await runAccess(31), { calledNext: false, statusCode: 403 });
  assert.deepEqual(await runAccess(90), { calledNext: true, statusCode: 200 });
});

test("goal editing and status changes are limited to assignees, chairman, or admin", async () => {
  state.commission = { id: 55, chairman_user_id: 31 };
  state.memberIds = [30, 31];

  const deniedEdit = await invoke(controller.saveCommissionGoals, {
    userId: 32,
    body: { goals: [{ id: 70, title: "Changed title" }] },
  });
  assert.equal(deniedEdit.statusCode, 403);

  const allowedEdit = await invoke(controller.saveCommissionGoals, {
    userId: 30,
    body: { goals: [{ id: 70, title: "Changed title" }] },
  });
  assert.equal(allowedEdit.statusCode, 200);

  const deniedStatus = await invoke(controller.updateCommissionGoalStatus, {
    userId: 32,
    body: { goalId: 70, is_done: true },
  });
  assert.equal(deniedStatus.statusCode, 403);
  assert.equal(state.goalStatus, false);

  const allowedStatus = await invoke(controller.updateCommissionGoalStatus, {
    userId: 30,
    body: { goalId: 70, is_done: true },
  });
  assert.equal(allowedStatus.statusCode, 200);
  assert.equal(state.goalStatus, true);
});

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

let attempts = 0;
let sentMessage;

const fakeSql = async (strings) => {
  const query = strings.join(" ").replace(/\s+/g, " ").trim().toLowerCase();
  if (query.includes("from ideas i") && query.includes("author.supervisor")) {
    return [{
      idea_id: 42,
      idea_title: "Process improvement",
      supervisor_id: 90,
      supervisor_email: "supervisor@example.test",
      supervisor_name: "Ada",
      supervisor_surname: "Manager",
    }];
  }
  throw new Error(`Unhandled test SQL: ${query}`);
};
fakeSql.begin = async (callback) => callback(fakeSql);

const mailerPath = path.resolve(__dirname, "../src/controllers/mailerController.js");
const dbPath = path.resolve(__dirname, "../src/controllers/db.js");
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: fakeSql,
};
require.cache[mailerPath] = {
  id: mailerPath,
  filename: mailerPath,
  loaded: true,
  exports: {
    sendMailViaGraph: async (message) => {
      attempts++;
      sentMessage = message;
      if (attempts < 3) throw new Error("Temporary mail failure");
    },
  },
};

const { notifySupervisorCommissionSelection } = require("../src/services/ideaNotificationService");

test("commission-selection email targets the idea supervisor and retries transient failures", async () => {
  const originalFrontendUrl = process.env.FRONTEND_URL;
  process.env.FRONTEND_URL = "https://kaizen.example.test/";
  attempts = 0;
  sentMessage = null;

  try {
    const result = await notifySupervisorCommissionSelection({
      ideaId: 42,
      supervisorId: 90,
    });
    assert.deepEqual(result, { ok: true });
    assert.equal(attempts, 3);
    assert.equal(sentMessage.to, "supervisor@example.test");
    assert.match(sentMessage.subject, /#42/);
    assert.match(sentMessage.text, /Wszystkie przypisane działy zaakceptowały pomysł/);
    assert.match(sentMessage.text, /https:\/\/kaizen\.example\.test\/ideas\/42\/commission/);
  } finally {
    if (originalFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = originalFrontendUrl;
  }
});

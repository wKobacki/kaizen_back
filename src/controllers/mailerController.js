const axios = require("axios");
const { ConfidentialClientApplication } = require("@azure/msal-node");

const CLIENT_ID = process.env.CLIENT_ID;
const TENANT_ID = process.env.TENANT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const SENDER_EMAIL = process.env.SENDER_EMAIL;
const GRAPH_SCOPE = process.env.GRAPH_SCOPE || "https://graph.microsoft.com/.default";

if (!CLIENT_ID || !TENANT_ID || !CLIENT_SECRET || !SENDER_EMAIL) {
  console.warn(
    "Graph mailer: missing env vars. Required: CLIENT_ID, TENANT_ID, CLIENT_SECRET, SENDER_EMAIL"
  );
}

const msalClient = new ConfidentialClientApplication({
  auth: {
    clientId: CLIENT_ID,
    authority: `https://login.microsoftonline.com/${TENANT_ID}`,
    clientSecret: CLIENT_SECRET,
  },
});

const getGraphToken = async () => {
  const result = await msalClient.acquireTokenByClientCredential({
    scopes: [GRAPH_SCOPE],
  });
  if (!result?.accessToken) throw new Error("Failed to acquire Graph access token");
  return result.accessToken;
};

const sendMailViaGraph = async ({ to, subject, text }) => {
  const accessToken = await getGraphToken();

  const payload = {
    message: {
      subject,
      body: {
        contentType: "Text",
        content: text,
      },
      toRecipients: [
        {
          emailAddress: { address: to },
        },
      ],
    },
    saveToSentItems: true,
  };

  await axios.post(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(SENDER_EMAIL)}/sendMail`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    }
  );
};

const sendVerificationEmail = async (email, name, surname, verificationCode) => {
  const text = `Hello ${name} ${surname},\n\nYour verification code is: ${verificationCode}\n\nThank you!`;
  try {
    await sendMailViaGraph({
      to: email,
      subject: "Account Verification",
      text,
    });
    console.log("Verification email sent (Graph)");
  } catch (err) {
    const status = err?.response?.status;
    const data = err?.response?.data;
    console.error("Graph sendMail ERROR:", status, data || err.message);
    throw new Error("Error sending verification email (Graph)");
  }
};

const sendPasswordResetEmail = async (email, name, surname, verificationCode) => {
  const text = `Hello ${name} ${surname},\n\nYour password reset verification code is: ${verificationCode}\n\nThank you!`;
  try {
    await sendMailViaGraph({
      to: email,
      subject: "Password Reset Request",
      text,
    });
    console.log("Password reset email sent (Graph)");
  } catch (err) {
    const status = err?.response?.status;
    const data = err?.response?.data;
    console.error("Graph sendMail ERROR:", status, data || err.message);
    throw new Error("Error sending password reset email (Graph)");
  }
};

module.exports = { sendVerificationEmail, sendPasswordResetEmail, sendMailViaGraph };
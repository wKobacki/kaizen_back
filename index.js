const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");

const cron = require("node-cron");
const { runCommissionGoalReminderJob } = require("./src/services/commissionGoalReminderJob");

const corsOptions = require("./src/config/corsOptions");
const { APP_PORT, API_ROUTE } = require("./config");

const loginRouter = require("./src/routes/loginRoute");
const refreshRouter = require("./src/routes/refreshRoute");
const logoutRouter = require("./src/routes/logoutRouter");
const userRouter = require("./src/routes/userRoute");
const restoreRouter = require("./src/routes/passwordRestore");
const resetRouter = require("./src/routes/passwordReset");
const ideasRouter = require("./src/routes/ideaRoute");
const ideasAdminRouter = require("./src/routes/ideaAdminRoute");
const eventLogRoute = require("./src/routes/eventLogRoute");
const auditLogger = require("./src/middleware/auditLogger");
const departmentsRoute = require("./src/routes/departmentsRoute");
const constantsRoute = require("./src/routes/constantsRoute");
const registerRouter = require("./src/routes/registerRoute"); 
const authRouter = require("./src/routes/authRoutes"); 

const app = express();

app.use(cors(corsOptions));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

app.use("/upload", express.static(path.join(__dirname, "upload")));

// request log (console)
app.use((req, res, next) => {
  console.log(`Incoming req: ${req.method} ${req.originalUrl}`);
  next();
});

app.use(
  auditLogger({
    enabled: true,
    onlyPaths: [
      `${API_ROUTE}/admin`,
      `${API_ROUTE}/ideas`,
      `${API_ROUTE}/users`,
      `${API_ROUTE}/event-log`,
    ],
    ignorePaths: [`${API_ROUTE}/refresh`],
  })
);

// Routes
app.use(`${API_ROUTE}/login`, loginRouter);

app.use(`${API_ROUTE}/register`, registerRouter);
app.use(`${API_ROUTE}/auth`, authRouter);
app.use(`${API_ROUTE}/refresh`, refreshRouter);
app.use(`${API_ROUTE}/logout`, logoutRouter);
app.use(`${API_ROUTE}/users`, userRouter);
app.use(`${API_ROUTE}/password-restore`, restoreRouter);
app.use(`${API_ROUTE}/password-reset`, resetRouter);
app.use(`${API_ROUTE}/ideas`, ideasRouter);

app.use(`${API_ROUTE}/ideasManagment`, ideasAdminRouter);
app.use(`${API_ROUTE}/event-log`, eventLogRoute);
app.use(`${API_ROUTE}/departments`, departmentsRoute);
app.use(`${API_ROUTE}/constants`, constantsRoute);

// global error handler
app.use((err, req, res, next) => {
  console.error("GLOBAL ERROR:", err);
  res.status(500).json({ message: "Internal server error" });
});

app.listen(APP_PORT, () => {
  console.log(`Server running on port ${APP_PORT}`);
});

cron.schedule("0 8 * * *", async () => {
  console.log("[CRON] Running commission goal reminders...");
  await runCommissionGoalReminderJob();
});
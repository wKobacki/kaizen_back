const express = require('express');
const cors = require('cors');
const cookieParser= require('cookire-parser');
const corsOptions = require('./src/config/corsOptions');
const loginRouter = require('./src/routes/loginRoute');
const refreshRouter = require('./src/routes/refreshRoute');
const logoutRouter = require('./src/routes/logoutRoutes');
const userRouter = require('./src/routes/userRoute');
const restoreRouter = require('./src/routes/passwordRestore');
const resetRouter = require('./src/routes/passwordReset');
const { APP_PORT, API_ROUTE } = require('./config');

const app = express();

app.use(cors(corsOptions));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

//log new req
app.use((req, res, next) => {
 console.log(`Incoming req: ${req.method} ${req.originalUrl}`);
 next();   
});

app.use(`${API_ROUTE}/login`, loginRouter);
app.use(`${API_ROUTE}/refresh`, refreshRouter);
app.use(`${API_ROUTE}/logout`, logoutRouter);
app.use(`${API_ROUTE}/users`, userRouter);
app.use(`${API_ROUTE}/password-restore`, restoreRouter);
app.use(`${API_ROUTE}/password-reset`, resetRouter);

//Global err handler
app.use((qrr, req, res, next) => {
    console.error(err);
    res.status(500).json({message: 'Internal server error'});
});

app.listen(APP_PORT, () => {
    console.log('Server running on port ' + APP_PORT);
})
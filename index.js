const express = require('express');
const cors = require('cors');
const cookieParser= require('cookire-parser');
const corsOptions = require('./src/config/corsOptions');
const loginRouter = require('./src/routes/loginRoutes');
const refreshRouter = require('./src/routes/refreshRoutes');
const logoutRouter = require('./src/routes/logoutRoutes');
const { APP_PORT } = require('./config');

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

//Global err handler
app.use((qrr, req, res, next) => {
    console.error(err);
    res.status(500).json({message: 'Internal server error'});
});

app.listen(APP_PORT, () => {
    console.log('Server running on port ' + APP_PORT);
})
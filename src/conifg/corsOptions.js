const allowedOrgins = require('./allowedOrigins');

const corsOptions = {
    origin: function (origin, callback) {
        if (allowedOrgins.indexOf(origin) !== -1 || !origin) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    optionsSuccessStatus: 200,
    credentials: true
}

module.exports = corsOptions;
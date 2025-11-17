require('dotenv').config();

module.exports = {
    APP_PORT: process.env.PORT,
    POSTGRES_DB_HOST: process.env.DB_HOST,
    POSTGRE_DB_NAME: process.env.DB_NAME,
    POSTGRES_DB_USER: process.env.DB_USER,
    POSTGRES_DB_PASSWORD: process.env.DB_PASSWORD,
    POSTGRES_DB_PORT: process.env.DB_PORT,
    EMAIL_USER: process.env.EMAIL_USER,
    EMAIl_PASSWORD: process.env.EMAIl_PASS,
    EMAIL_SERVICE: process.env.EMAIL_SERVICE,
    BASE_URL: process.env.BASE_URL,
    POST_PICTURE: process.env.POST_PICTURE_DIR || 'uploads/posts/',
    ACCESS_TOKEN_SECRET: process.env.ACCESS_TOKEN_SECRET,
    REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET
};

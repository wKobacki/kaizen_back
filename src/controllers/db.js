const postgres = require('postgresql');
const {POSTGRES_DB_HOST, POSTGRE_DB_NAME, POSTGRES_DB_USER, POSTGRES_DB_PASSWORD, POSTGRES_DB_PORT} = require('../../config');

const sql = postgres(`postgresql://${POSTGRES_DB_USER}:${POSTGRES_DB_PASSWORD}@${POSTGRES_DB_HOST}:${POSTGRES_DB_PORT}/${POSTGRE_DB_NAME}`);

module.exports = sql;
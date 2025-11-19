const postgres = require('postgres');
const {
    POSTGRES_DB_HOST,
    POSTGRES_DB_NAME,
    POSTGRES_DB_USER,
    POSTGRES_DB_PASSWORD,
    POSTGRES_DB_PORT
} = require('../../config');

// Configuration DB connection
const sql = postgres({
    host: POSTGRES_DB_HOST,
    port: POSTGRES_DB_PORT,
    database: POSTGRES_DB_NAME,
    username: POSTGRES_DB_USER,
    password: POSTGRES_DB_PASSWORD
});

// Test connection
(async () => {
    try {
        console.log('Attempting to connect to the database...');
        
        const result = await sql`SELECT NOW()`;
        
        console.log(`Connected to the database! PostgreSQL server is running.`);
        console.log(`Current time: ${result[0].now}`);
        console.log(`Host: ${POSTGRES_DB_HOST}`);
        console.log(`Database: ${POSTGRES_DB_NAME}`);
        console.log(`User: ${POSTGRES_DB_USER}`);
    } catch (err) {
        console.error('Error during database connection');
        console.error(err.message);
    }
})();

module.exports = sql;
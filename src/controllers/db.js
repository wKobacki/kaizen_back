const postgres = require('postgres');
const {
    POSTGRES_DB_HOST,
    POSTGRES_DB_NAME,
    POSTGRES_DB_USER,
    POSTGRES_DB_PASSWORD,
    POSTGRES_DB_PORT
} = require('../../config');

// konfiguracja połączenia
const sql = postgres({
    host: POSTGRES_DB_HOST,
    port: POSTGRES_DB_PORT,
    database: POSTGRES_DB_NAME,
    username: POSTGRES_DB_USER,
    password: POSTGRES_DB_PASSWORD
});

// TEST POŁĄCZENIA Z BAZĄ
(async () => {
    try {
        console.log('🔄 Próba połączenia z bazą danych...');
        
        const result = await sql`SELECT NOW()`;
        
        console.log(`✅ Połączono z bazą danych! Serwer PostgreSQL działa.`);
        console.log(`🕒 Aktualny czas DB: ${result[0].now}`);
        console.log(`📌 Host: ${POSTGRES_DB_HOST}`);
        console.log(`📌 Baza: ${POSTGRES_DB_NAME}`);
        console.log(`📌 Użytkownik: ${POSTGRES_DB_USER}`);
    } catch (err) {
        console.error('❌ Błąd połączenia z bazą danych PostgreSQL!');
        console.error(err.message);
    }
})();

module.exports = sql;
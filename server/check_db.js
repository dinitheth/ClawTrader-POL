const postgres = require('postgres');
const sql = postgres('postgresql://neondb_owner:npg_vbOBoLu6Wd8I@ep-fancy-credit-ai97h88q-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require');

async function check() {
    const result = await sql`SELECT * FROM agents LIMIT 1`;
    console.log(result);
    await sql.end();
}
check();

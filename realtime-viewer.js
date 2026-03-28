const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

console.log("==========================================");
console.log("       FLUXBASE REAL-TIME WATCHER        ");
console.log("==========================================");
console.log("Connecting directly to Postgres database...");

// Configure DB Connection
const pool = new Pool({
    connectionString: process.env.AWS_RDS_POSTGRES_URL,
    ssl: { rejectUnauthorized: false }
});

async function startViewer() {
    try {
        const client = await pool.connect();
        console.log("✅ Securely connected! Listening for live mutations...");
        console.log("Waiting for new chat messages... (Send a message from Vercel to see it pop up here!)\n");

        client.on('notification', (msg) => {
            if (msg.channel === 'fluxbase_live') {
                try {
                    const data = JSON.parse(msg.payload);
                    const time = new Date().toLocaleTimeString();
                    
                    if (data.event_type === 'row.inserted' || data.event_type === 'raw_sql_mutation') {
                        console.log(`[${time}] 🔴 REAL-TIME TRIGGER FIRED!`);
                        console.log(`            Project  : ${data.project_id || (data.data && data.data.new && data.data.new.project_id) || 'Unknown'}`);
                        console.log(`            Table    : ${data.table_id || data.table_name}`);
                        
                        if (data.data?.new) {
                            console.log(`            New Row  :`, JSON.stringify(data.data.new));
                        } else {
                            console.log(`            Payload  :`, JSON.stringify(data));
                        }
                        console.log("------------------------------------------");
                    }
                } catch (e) {
                    console.log("[Parse Error] Received raw notification:", msg.payload);
                }
            }
        });

        // Listen exactly where Render listens
        await client.query('LISTEN fluxbase_live');
        
    } catch (err) {
        console.error("❌ Failed to connect:", err);
    }
}

// Ensure clean exit
process.on('SIGINT', () => {
    console.log("\nStopping Real-Time watcher...");
    pool.end();
    process.exit();
});

startViewer();

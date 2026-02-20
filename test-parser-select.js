const { Parser } = require('node-sql-parser');
const p = new Parser();
const query = `
        SELECT
        m.id, m.gym_id, m.plan_id, m.member_id, m.name, m.email, m.phone_number, m.age,
          m.membership_status, m.membership_type, m.join_date, m.expiry_date, m.created_at, m.profile_url,
          p.plan_name, p.price, p.duration_months
        FROM members m
        LEFT JOIN plans p ON m.plan_id = p.id
        WHERE m.id = 'actualId'`;
const ast = p.astify(query, { database: 'PostgreSQL' });
console.log("WHERE Clause:", JSON.stringify(ast[0].where, null, 2));

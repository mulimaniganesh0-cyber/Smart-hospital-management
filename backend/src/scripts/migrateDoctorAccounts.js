/* Creates one application account for each existing doctor, safely and idempotently.
   Temporary secrets are never logged or persisted in plaintext. Admins use the reset
   flow to deliver an activation link through a verified address. */
require('dotenv').config();
const crypto=require('crypto');
const bcrypt=require('bcryptjs');
const { pool }=require('../config/database');
const usernameFor=name => {
  const words=String(name||'').toLowerCase().replace(/\bdr\.?\b/g,'').replace(/[^a-z0-9 ]/g,' ').trim().split(/\s+/).filter(Boolean);
  return `dr${words.at(-1) || 'doctor'}`.slice(0,54);
};
async function run() {
  const client=await pool.connect(); let created=0,reused=0,missingRealEmail=0;
  try { await client.query('BEGIN');
    const doctors=(await client.query('SELECT * FROM doctors ORDER BY id FOR UPDATE')).rows;
    for (const d of doctors) {
      if(d.user_id) { reused++; continue; }
      const base=usernameFor(d.name); let login=`${base}@gmail.com`, i=0;
      while((await client.query('SELECT 1 FROM users WHERE email=$1',[login])).rowCount) login=`${base}${++i}@gmail.com`;
      const temporaryPassword=crypto.randomBytes(24).toString('base64url');
      const hash=await bcrypt.hash(temporaryPassword,12);
      const verifiedEmail=d.email && !/@gmail\.com$/i.test(d.email) ? d.email : null;
      const user=(await client.query(`INSERT INTO users(name,email,phone,password_hash,user_type,role,hospital_id,is_verified,account_status,password_reset_required)
        VALUES($1,$2,$3,$4,'doctor','doctor',$5,false,'ACTIVE',true) RETURNING id`,[d.name,login,d.phone||null,hash,d.hospital_id])).rows[0];
      await client.query(`UPDATE doctors SET user_id=$1, account_activation_status=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$3`,[user.id,verifiedEmail?'PASSWORD_RESET_REQUIRED':'EMAIL_REQUIRED',d.id]);
      if(!verifiedEmail) missingRealEmail++; created++;
    }
    await client.query('COMMIT');
    console.log(JSON.stringify({total_doctors:doctors.length,created,reused,missing_real_email:missingRealEmail,note:'No passwords were printed. Use the admin reset workflow for activation.'}));
  } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); await pool.end(); }
}
run().catch(e=>{console.error('Doctor account migration failed:',e.message);process.exitCode=1;});

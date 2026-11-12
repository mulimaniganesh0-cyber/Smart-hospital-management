const test = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../src/controllers/authController');
const User = require('../src/models/User');
const bcrypt = require('bcryptjs');
const { pool } = require('../src/config/database');

const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

test('login lookup selects driver authorization columns from users', async (t) => {
  const originalQuery = pool.query;
  let sqlSeen = '';
  pool.query = async (sql) => {
    sqlSeen = String(sql);
    return { rowCount: 0, rows: [] };
  };
  t.after(() => { pool.query = originalQuery; });

  await User.findByLogin('driver@example.test');
  assert.match(sqlSeen, /FROM users u WHERE lower\(u\.email\)/);
  assert.match(sqlSeen, /to_jsonb\(u\)->>'driver_type' AS driver_type/);
  assert.match(sqlSeen, /to_jsonb\(u\)->>'driver_status' AS driver_status/);
});

async function withLoginMocks(t, user, queryResults = []) {
  const originals = {
    findByLogin: User.findByLogin,
    findByEmail: User.findByEmail,
    compare: bcrypt.compare,
    query: pool.query,
    jwtSecret: process.env.JWT_SECRET,
    jwtExpire: process.env.JWT_EXPIRE,
  };
  User.findByLogin = async () => user;
  bcrypt.compare = async () => true;
  const calls = [];
  pool.query = async (sql, values) => {
    calls.push({ sql: String(sql), values });
    return queryResults.shift() || { rowCount: 0, rows: [] };
  };
  process.env.JWT_SECRET = 'test-secret';
  process.env.JWT_EXPIRE = '1h';
  t.after(() => {
    User.findByLogin = originals.findByLogin;
    User.findByEmail = originals.findByEmail;
    bcrypt.compare = originals.compare;
    pool.query = originals.query;
    if (originals.jwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originals.jwtSecret;
    if (originals.jwtExpire === undefined) delete process.env.JWT_EXPIRE;
    else process.env.JWT_EXPIRE = originals.jwtExpire;
  });
  return calls;
}

test('patient, hospital, and admin logins keep their backend portal roles', async (t) => {
  for (const role of ['patient', 'hospital', 'admin']) {
    await t.test(role, async (subtest) => {
      await withLoginMocks(subtest, {
        id: 20, name: 'Existing account', email: `${role}@example.test`, phone: '',
        password_hash: 'hash', user_type: role, account_status: 'ACTIVE',
      });
      const res = response();
      await auth.login({ body: { email: `${role}@example.test`, password: 'password' } }, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.user.user_type, role);
      assert.ok(res.body.token);
    });
  }
});

test('invalid credentials do not receive a login token', async (t) => {
  await withLoginMocks(t, {
    id: 22, name: 'Patient', email: 'patient@example.test', phone: '',
    password_hash: 'hash', user_type: 'patient', account_status: 'ACTIVE',
  });
  bcrypt.compare = async () => false;
  const res = response();
  await auth.login({ body: { email: 'patient@example.test', password: 'wrong' } }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.token, undefined);
});

test('password change verifies the old password, clears the forced-change flag, and versions sessions',async(t)=>{
 const calls=await withLoginMocks(t,{id:91,email:'driver@example.test',password_hash:'old-hash',token_version:2},[{rowCount:1,rows:[{id:91,email:'driver@example.test',password_hash:'old-hash'}]},{rowCount:1,rows:[{token_version:3}]},{rowCount:0,rows:[]}]);
  User.findByEmail=async()=>({id:91,email:'driver@example.test',password_hash:'old-hash'});
  bcrypt.compare=async(candidate,hash)=>candidate==='OldPassword1!'&&hash==='old-hash';
 const res=response();await auth.changePassword({user:{id:91,email:'driver@example.test'},body:{old_password:'OldPassword1!',new_password:'NewPassword2!',confirm_password:'NewPassword2!'}},res);
 assert.equal(res.statusCode,200);assert.ok(res.body.token);assert.match(calls[0].sql,/password_reset_required=FALSE/);assert.match(calls[0].sql,/token_version=COALESCE\(token_version,0\)\+1/);
});

test('password change rejects a mismatched confirmation before storage',async(t)=>{
 await withLoginMocks(t,{id:92,email:'driver@example.test',password_hash:'old-hash'},[]);
 const res=response();await auth.changePassword({user:{id:92,email:'driver@example.test'},body:{old_password:'OldPassword1!',new_password:'NewPassword2!',confirm_password:'Different3!'}},res);
 assert.equal(res.statusCode,400);assert.match(res.body.message,/confirmation/);
});

test('doctor login requires an active doctor profile linked to its hospital', async (t) => {
  const calls = await withLoginMocks(t, {
    id: 10, name: 'Doctor', email: 'doctor@example.test', phone: '',
    password_hash: 'hash', user_type: 'staff', role: 'doctor', hospital_id: 3,
    account_status: 'ACTIVE', password_reset_required: false,
  });
  const res = response();
  await auth.login({ body: { email: 'doctor@example.test', password: 'password' } }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'DOCTOR_NOT_AUTHORIZED');
  assert.match(calls[0].sql, /JOIN hospitals/);
  assert.match(calls[0].sql, /account_activation_status IN \('ACTIVE', 'EMAIL_REQUIRED', 'PASSWORD_RESET_REQUIRED'\)/);
});

test('active doctor with an associated profile receives the doctor portal role', async (t) => {
  await withLoginMocks(t, {
    id: 11, name: 'Doctor', email: 'doctor@example.test', phone: '',
    password_hash: 'hash', user_type: 'staff', role: 'doctor', hospital_id: 3,
    account_status: 'ACTIVE', password_reset_required: false,
  }, [{ rowCount: 1, rows: [{ id: 21 }] }]);
  const res = response();
  await auth.login({ body: { email: 'doctor@example.test', password: 'password' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.user.user_type, 'doctor');
});

test('doctor accounts requiring a first-login password change receive a restricted session', async (t) => {
  await withLoginMocks(t, {
    id: 14, name: 'Doctor', email: 'doctor@example.test', phone: '',
    password_hash: 'hash', user_type: 'staff', role: 'doctor', hospital_id: 3,
    account_status: 'ACTIVE', password_reset_required: true,
  }, [{ rowCount: 1, rows: [{ id: 22 }] }]);
  const res = response();
  await auth.login({ body: { email: 'doctor@example.test', password: 'password' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.user.password_reset_required, true);
  assert.ok(res.body.token);
});

test('active driver without an active assigned ambulance cannot sign in', async (t) => {
  await withLoginMocks(t, {
    id: 12, name: 'Driver', email: 'driver@example.test', phone: '',
    password_hash: 'hash', user_type: 'staff', role: 'ambulance_driver',
    hospital_id: 4, driver_type: 'hospital_driver', driver_status: 'active',
    account_status: 'ACTIVE', password_reset_required: false,
  });
  const res = response();
  await auth.login({ body: { email: 'driver@example.test', password: 'password' } }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'DRIVER_NOT_AUTHORIZED');
  assert.equal(res.body.token, undefined);
});

test('unapproved private driver cannot sign in', async (t) => {
  await withLoginMocks(t, {
    id: 23, name: 'Pending driver', email: 'pending@example.test', phone: '',
    password_hash: 'hash', user_type: 'ambulance_driver', role: 'ambulance_driver',
    hospital_id: null, driver_type: 'private_driver', driver_status: 'pending_verification',
    account_status: 'PENDING_VERIFICATION', password_reset_required: false,
  });
  const res = response();
  await auth.login({ body: { email: 'pending@example.test', password: 'password' } }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'DRIVER_VERIFICATION_PENDING');
  assert.equal(res.body.token, undefined);
});

test('active driver with an active ambulance receives the driver portal role', async (t) => {
  const calls = await withLoginMocks(t, {
    id: 13, name: 'Driver', email: 'driver@example.test', phone: '',
    password_hash: 'hash', user_type: 'staff', role: 'ambulance_driver',
    hospital_id: 4, driver_type: 'hospital_driver', driver_status: 'active',
    account_status: 'ACTIVE', password_reset_required: false,
  }, [{ rowCount: 1, rows: [{ '?column?': 1 }] }]);
  const res = response();
  await auth.login({ body: { email: 'driver@example.test', password: 'password' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.user.user_type, 'ambulance_driver');
  assert.match(calls[0].sql, /private_operator_user_id/);
});

test('hospital driver with an initial password receives a password-change-required session', async (t) => {
  await withLoginMocks(t, { id:31,name:'Managed driver',email:'driver@example.test',phone:'+919876543210',password_hash:'hash',user_type:'staff',role:'ambulance_driver',hospital_id:5,driver_type:'hospital_driver',driver_status:'active',account_status:'ACTIVE',password_reset_required:true }, [{rowCount:1,rows:[{'?column?':1}]}]);
  const res=response();await auth.login({body:{phone:'+91 98765 43210',password:'InitialPass1!'}},res);
  assert.equal(res.statusCode,200);assert.equal(res.body.user.password_reset_required,true);assert.ok(res.body.token);
});

test('approved private ambulance driver receives the driver portal role', async (t) => {
  const calls = await withLoginMocks(t, {
    id: 15, name: 'Private driver', email: 'private-driver@example.test', phone: '',
    password_hash: 'hash', user_type: 'ambulance_driver', role: 'ambulance_driver',
    hospital_id: null, driver_type: 'private_driver', driver_status: 'active',
    account_status: 'ACTIVE', password_reset_required: false,
  }, [{ rowCount: 1, rows: [{ '?column?': 1 }] }]);
  const res = response();
  await auth.login({ body: { email: 'private-driver@example.test', password: 'password' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.user.user_type, 'ambulance_driver');
  assert.equal(res.body.user.driver_type, 'private_driver');
  assert.match(calls[0].sql, /private_operator_user_id/);
  assert.deepEqual(calls[0].values, [15, 'private_driver', null]);
});

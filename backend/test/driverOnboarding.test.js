const test=require('node:test');
const assert=require('node:assert/strict');
const onboarding=require('../src/controllers/driverOnboardingController');
const auth=require('../src/controllers/authController');
const {pool}=require('../src/config/database');

function response(){return{statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};}

test('public private registration creates a pending driver and inactive private ambulance',async(t)=>{
 const original=pool.connect;const calls=[];const client={async query(sql,values){calls.push({sql:String(sql),values});if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK')return{rowCount:0,rows:[]};if(String(sql).includes('INSERT INTO users'))return{rowCount:1,rows:[{id:75,name:'Private Driver',driver_status:'pending_verification'}]};if(String(sql).includes('INSERT INTO ambulances'))return{rowCount:1,rows:[]};throw new Error(`Unexpected SQL: ${sql}`);},release(){}};pool.connect=async()=>client;t.after(()=>{pool.connect=original;});
 const res=response();await onboarding.registerPrivateDriver({body:{name:'Private Driver',email:'driver@example.test',phone:'+919876543210',password:'SecurePassword12!',license_number:'DL-99',license_expiry:'2099-01-01',vehicle_number:'KA-01-AB-1234',vehicle_type:'BLS',service_area:'Bengaluru',operating_location:'Indiranagar',documents:[]}},res);
 assert.equal(res.statusCode,201);assert.equal(res.body.data.driver_status,'pending_verification');const userInsert=calls.find(c=>c.sql.includes('INSERT INTO users'));const ambulanceInsert=calls.find(c=>c.sql.includes('INSERT INTO ambulances'));assert.match(userInsert.sql,/PENDING_VERIFICATION/);assert.match(userInsert.sql,/pending_verification/);assert.match(ambulanceInsert.sql,/FALSE,'PENDING_VERIFICATION',FALSE/);assert.notEqual(userInsert.values[3],'SecurePassword12!');assert.equal(calls.at(-1).sql,'COMMIT');
});

test('public auth registration cannot create a hospital driver role',async(t)=>{
 const original=pool.query;pool.query=async()=>{throw new Error('Public driver signup must not touch user records');};t.after(()=>{pool.query=original;});
 const res=response();await auth.register({body:{name:'Bad Actor',email:'bad@example.test',phone:'1234567890',password:'password',user_type:'ambulance_driver'},app:{get:()=>null}},res);
 assert.equal(res.statusCode,400);assert.equal(res.body.message,'Invalid user type');
});

test('hospital creates a mobile-only driver with a hashed initial password and ambulance assignment',async(t)=>{
 const originalQuery=pool.query,originalConnect=pool.connect;const calls=[];
 pool.query=async(sql)=>{calls.push(String(sql));return{rowCount:1,rows:[{id:8}]};};
 const client={async query(sql,values){calls.push({sql:String(sql),values});if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return{rowCount:0,rows:[]};if(String(sql).includes('SELECT id,vehicle_number FROM ambulances'))return{rowCount:1,rows:[{id:4,vehicle_number:'AMB-4'}]};if(String(sql).includes('SELECT pg_advisory_xact_lock'))return{rowCount:1,rows:[{}]};if(String(sql).includes('SELECT 1 FROM users'))return{rowCount:0,rows:[]};if(String(sql).includes('INSERT INTO users'))return{rowCount:1,rows:[{id:77,name:'Hospital Driver',phone:'+919876543210',driver_status:'active'}]};return{rowCount:1,rows:[]};},release(){}};
 pool.connect=async()=>client;t.after(()=>{pool.query=originalQuery;pool.connect=originalConnect;});
 const req={user:{id:2,name:'Hospital',user_type:'hospital'},body:{name:'Hospital Driver',phone:'+91 98765 43210',license_number:'DL-1234',license_expiry:'2099-01-01',ambulance_id:4,initial_password:'InitialPass1!'}};
 const res=response();await onboarding.createHospitalDriver(req,res);
 assert.equal(res.statusCode,201);assert.equal(res.body.data.initial_password,'InitialPass1!');assert.equal(res.body.data.password_change_required,true);
 const insert=calls.find(c=>typeof c==='object'&&c.sql.includes('INSERT INTO users'));
 assert.match(insert.sql,/password_reset_required/);assert.match(insert.sql,/'active'/);assert.notEqual(insert.values[3],'InitialPass1!');
 assert.ok(calls.some(c=>typeof c==='object'&&c.sql.includes('UPDATE ambulances')&&c.values[0]===77));
});

test('hospital driver reset scopes the update to the owning hospital and returns a one-time password',async(t)=>{
 const original=pool.query;const calls=[];pool.query=async(sql,values)=>{calls.push({sql:String(sql),values});if(String(sql).includes('UPDATE users'))return{rowCount:1,rows:[{id:77}]};if(String(sql).includes('SELECT id FROM hospitals'))return{rowCount:1,rows:[{id:8}]};return{rowCount:1,rows:[]};};t.after(()=>{pool.query=original;});
 const req={user:{id:2,user_type:'hospital'},params:{driverId:'77'},body:{},app:{get:()=>null}};const res=response();await onboarding.resetHospitalDriverPassword(req,res);
 const update=calls.find(c=>c.sql.includes('UPDATE users'));assert.deepEqual(update.values.slice(1),[77,8]);assert.equal(res.statusCode,200);assert.equal(res.body.data.password_change_required,true);assert.ok(res.body.data.temporary_password);
});

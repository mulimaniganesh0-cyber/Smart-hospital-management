const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const { sendEmail } = require('../utils/emailService');

const clean = (v) => String(v || '').trim();
const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const validPhone = (v) => /^\+?[0-9 ()-]{8,20}$/.test(v);
const validDate = (v) => !Number.isNaN(Date.parse(v)) && new Date(v) > new Date();
const safeDocuments = (value) => Array.isArray(value) ? value.slice(0, 10).filter((x) => {
  if(typeof x!=='string'||x.length>1000)return false;
  try { const url=new URL(x);return url.protocol==='https:'&&!url.username&&!url.password; } catch (_) { return false; }
}).map((x) => x.slice(0, 1000)) : [];
const normalizePhone = (value) => { const raw=clean(value); if(!/^\+?[0-9 ()-]{8,20}$/.test(raw))return null; const digits=raw.replace(/\D/g,''); return digits.length>=8&&digits.length<=15 ? (raw.startsWith('+')?'+':'')+digits : null; };
const temporaryPassword = () => { const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%'; let out=''; const bytes=crypto.randomBytes(18); for(const b of bytes)out+=alphabet[b%alphabet.length]; return `${out}Aa1!`; };

async function hospitalForManager(user) {
  const superAdmin = user.role === 'super_admin' || user.user_type === 'admin';
  if (superAdmin) return { superAdmin: true, hospitalId: Number(user.hospital_id) || null };
  const canManage = user.user_type === 'hospital' || user.role === 'hospital_admin' || user.permissions?.includes('manage_drivers');
  if (!canManage) return { denied: true };
  const result = user.user_type === 'hospital'
    ? await pool.query('SELECT id FROM hospitals WHERE user_id=$1', [user.id])
    : await pool.query('SELECT id FROM hospitals WHERE id=$1', [user.hospital_id]);
  return { hospitalId: result.rows[0]?.id || null };
}

exports.createHospitalDriver = async (req, res) => {
  const user = req.user;
  const scope = await hospitalForManager(user);
  if (scope.denied) return res.status(403).json({ success: false, message: 'Driver management permission required' });
  const hospitalId = Number(req.body.hospital_id || scope.hospitalId);
  if (!Number.isInteger(hospitalId) || (!scope.superAdmin && hospitalId !== scope.hospitalId)) return res.status(403).json({ success: false, message: 'You cannot manage drivers for another hospital' });
  const { name, email, phone, license_number, license_expiry, ambulance_id } = req.body;
  const values = { name: clean(name), email: clean(email).toLowerCase(), phone: normalizePhone(phone), license_number: clean(license_number), license_expiry };
  const initialPassword = typeof req.body.initial_password==='string' && req.body.initial_password.length ? req.body.initial_password : temporaryPassword();
  if (!values.name || !values.phone || (values.email && !validEmail(values.email)) || !values.license_number || values.license_number.length<4 || !validDate(license_expiry) || !Number.isInteger(Number(ambulance_id)) || initialPassword.length<10 || !/[A-Z]/.test(initialPassword) || !/[a-z]/.test(initialPassword) || !/[0-9]/.test(initialPassword) || !/[!@#$%^&*(),.?":{}|<>_\-]/.test(initialPassword)) {
    return res.status(400).json({ success: false, message: 'Provide a name, valid mobile, optional valid email, license details with future expiry, ambulance, and password of at least 10 characters' });
  }
  const client = await pool.connect();
  try {
    const normalizedEmail = values.email || `driver-${values.phone.replace(/\D/g,'')}@driver.local`;
    const passwordHash = await bcrypt.hash(initialPassword, 10);
    await client.query('BEGIN');
    const ambulance = await client.query(`SELECT id,vehicle_number FROM ambulances WHERE id=$1 AND hospital_id=$2 AND is_active=TRUE AND driver_user_id IS NULL FOR UPDATE`, [Number(ambulance_id), hospitalId]);
    if (!ambulance.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ success: false, message: 'Choose an unassigned active ambulance at this hospital' }); }
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[values.phone.replace(/\D/g,'')]);
    const exists = await client.query("SELECT 1 FROM users WHERE lower(email)=lower($1) OR regexp_replace(COALESCE(phone,''),'[^0-9]','','g')=regexp_replace($2,'[^0-9]','','g') LIMIT 1", [normalizedEmail, values.phone]);
    if (exists.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ success: false, message: 'An account already uses this mobile number or email' }); }
    const driver = await client.query(`INSERT INTO users(name,email,phone,password_hash,user_type,role,hospital_role,hospital_id,is_verified,account_status,password_reset_required,driver_type,driver_status,driver_license_number,driver_license_expiry)
      VALUES($1,$2,$3,$4,'staff','ambulance_driver','ambulance_driver',$5,TRUE,'ACTIVE',TRUE,'hospital_driver','active',$6,$7) RETURNING id,name,email,phone,driver_type,driver_status,hospital_id`,
      [values.name, normalizedEmail, values.phone, passwordHash, hospitalId, values.license_number, values.license_expiry]);
    await client.query(`UPDATE ambulances SET driver_user_id=$1,driver_name=$2,driver_phone=$3,is_available=TRUE,status='AVAILABLE' WHERE id=$4 AND hospital_id=$5`, [driver.rows[0].id, values.name, values.phone, Number(ambulance_id), hospitalId]);
    await client.query('COMMIT');
    return res.status(201).json({ success: true, data: { ...driver.rows[0], ambulance_id: Number(ambulance_id), vehicle_number: ambulance.rows[0].vehicle_number, initial_password: initialPassword, password_change_required: true }, message: 'Driver account created. Share this initial password securely; it will not be shown again.' });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return res.status(error.code === '23505' ? 409 : 500).json({ success: false, message: error.code === '23505' ? 'An account already uses this mobile number or email' : 'Unable to create hospital driver' });
  } finally { client.release(); }
};

exports.resendHospitalInvitation = async (req,res) => {
  const scope=await hospitalForManager(req.user);
  if(scope.denied)return res.status(403).json({success:false,message:'Driver management permission required'});
  const hospitalId=Number(req.body.hospital_id||scope.hospitalId);
  if(!hospitalId||(!scope.superAdmin&&hospitalId!==scope.hospitalId))return res.status(403).json({success:false,message:'You cannot manage drivers for another hospital'});
  const token=crypto.randomBytes(32).toString('base64url'),hash=crypto.createHash('sha256').update(token).digest('hex');
  const result=await pool.query(`UPDATE users SET driver_invite_token_hash=$1,driver_invite_expires_at=CURRENT_TIMESTAMP+INTERVAL '7 days',updated_at=CURRENT_TIMESTAMP
    WHERE id=$2 AND hospital_id=$3 AND driver_type='hospital_driver' AND driver_status='invited' RETURNING name,email`,[hash,req.params.driverId,hospitalId]);
  if(!result.rowCount)return res.status(404).json({success:false,message:'Pending hospital driver invitation not found'});
  const base=(process.env.FRONTEND_URL||'').replace(/\/$/,'');
  const activationUrl=base?`${base}/#/driver-activation?token=${encodeURIComponent(token)}`:null;
  const sent=activationUrl?await sendEmail(result.rows[0].email,'Activate your hospital ambulance driver account',`<p>Hello ${result.rows[0].name.replace(/[<>]/g,'')},</p><p>Your hospital invitation has been renewed. Set a password to activate:</p><p><a href="${activationUrl}">Activate driver account</a></p><p>This link expires in seven days.</p>`):false;
  res.json({success:sent,message:sent?'A new activation link was sent.':'The email service is unavailable; the invitation remains pending.'});
};

exports.resetHospitalDriverPassword = async (req,res) => {
  const scope=await hospitalForManager(req.user);
  if(scope.denied)return res.status(403).json({success:false,message:'Driver management permission required'});
  const hospitalId=Number(req.body.hospital_id||scope.hospitalId);
  if(!hospitalId||(!scope.superAdmin&&hospitalId!==scope.hospitalId))return res.status(403).json({success:false,message:'You cannot manage drivers for another hospital'});
  const password=temporaryPassword();
  try {
    const hash=await bcrypt.hash(password,10);
    const result=await pool.query(`UPDATE users SET password_hash=$1,password_reset_required=TRUE,driver_status=CASE WHEN driver_status='invited' THEN 'active' ELSE driver_status END,account_status=CASE WHEN driver_status='invited' THEN 'ACTIVE' ELSE account_status END,is_verified=TRUE,driver_invite_token_hash=NULL,driver_invite_expires_at=NULL,token_version=COALESCE(token_version,0)+1,updated_at=CURRENT_TIMESTAMP WHERE id=$2 AND hospital_id=$3 AND driver_type='hospital_driver' AND role='ambulance_driver' RETURNING id,driver_status,account_status`,[hash,Number(req.params.driverId),hospitalId]);
    if(!result.rowCount)return res.status(404).json({success:false,message:'Hospital driver not found'});
    if(result.rows[0].driver_status==='active'&&result.rows[0].account_status==='ACTIVE')await pool.query(`UPDATE ambulances SET is_available=TRUE,status='AVAILABLE' WHERE driver_user_id=$1 AND is_active=TRUE`,[Number(req.params.driverId)]);
    req.app.get('io')?.in(`driver_${req.params.driverId}`).disconnectSockets(true);
    return res.json({success:true,message:'Temporary password created. Share it securely; it is shown only once.',data:{driver_id:Number(req.params.driverId),temporary_password:password,password_change_required:true}});
  } catch (_) { return res.status(500).json({success:false,message:'Unable to reset driver password'}); }
};

exports.editHospitalDriver = async (req,res) => {
  const scope=await hospitalForManager(req.user);
  if(scope.denied)return res.status(403).json({success:false,message:'Driver management permission required'});
  const hospitalId=Number(req.body.hospital_id||scope.hospitalId);
  if(!hospitalId||(!scope.superAdmin&&hospitalId!==scope.hospitalId))return res.status(403).json({success:false,message:'You cannot manage drivers for another hospital'});
  const name=clean(req.body.name), rawPhone=clean(req.body.phone), phone=normalizePhone(rawPhone), email=clean(req.body.email).toLowerCase(), license=clean(req.body.license_number), expiry=req.body.license_expiry;
  if(!name||!phone||(email&&!validEmail(email))||license.length<4||!validDate(expiry))return res.status(400).json({success:false,message:'Provide a name, valid mobile, optional valid email, license number, and future expiry date'});
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[phone.replace(/\D/g,'')]);
    const duplicate=await client.query("SELECT 1 FROM users WHERE id<>$1 AND (regexp_replace(COALESCE(phone,''),'[^0-9]','','g')=regexp_replace($2,'[^0-9]','','g') OR ($3<>'' AND lower(email)=lower($3))) LIMIT 1",[Number(req.params.driverId),phone,email]);
    if(duplicate.rowCount){await client.query('ROLLBACK');return res.status(409).json({success:false,message:'Another account already uses this mobile number or email'});}
    const normalizedEmail=email||`driver-${phone.replace(/\D/g,'')}@driver.local`;
    const result=await client.query(`UPDATE users SET name=$1,phone=$2,email=$3,driver_license_number=$4,driver_license_expiry=$5,updated_at=CURRENT_TIMESTAMP WHERE id=$6 AND hospital_id=$7 AND driver_type='hospital_driver' AND role='ambulance_driver' RETURNING id,name,phone,email,driver_license_number,driver_license_expiry`,[name,phone,normalizedEmail,license,expiry,Number(req.params.driverId),hospitalId]);
    if(!result.rowCount){await client.query('ROLLBACK');return res.status(404).json({success:false,message:'Hospital driver not found'});}
    await client.query('UPDATE ambulances SET driver_name=$1,driver_phone=$2,updated_at=CURRENT_TIMESTAMP WHERE driver_user_id=$3',[name,phone,Number(req.params.driverId)]);
    await client.query('COMMIT');return res.json({success:true,data:result.rows[0],message:'Driver details updated'});
  } catch(error){await client.query('ROLLBACK').catch(()=>{});return res.status(error.code==='23505'?409:500).json({success:false,message:error.code==='23505'?'Mobile number or email is already registered':'Unable to update driver details'});} finally{client.release();}
};

exports.listHospitalDrivers = async (req, res) => {
  const scope = await hospitalForManager(req.user);
  if (scope.denied) return res.status(403).json({ success: false, message: 'Driver management permission required' });
  const hospitalId = Number(req.query.hospital_id || scope.hospitalId);
  if (!hospitalId || (!scope.superAdmin && hospitalId !== scope.hospitalId)) return res.status(403).json({ success: false, message: 'You cannot view drivers for another hospital' });
  const result = await pool.query(`SELECT u.id,u.name,u.email,u.phone,u.driver_type,u.driver_status,u.driver_license_number,u.driver_license_expiry,u.account_status,u.password_reset_required,a.id ambulance_id,a.vehicle_number,a.is_active ambulance_active,a.is_available,
      EXISTS(SELECT 1 FROM emergency_requests e WHERE e.assigned_driver_user_id=u.id AND e.status NOT IN ('completed','resolved','cancelled')) OR EXISTS(SELECT 1 FROM ambulance_bookings b WHERE b.driver_user_id=u.id AND b.status NOT IN ('completed','cancelled')) AS has_active_trip
    FROM users u LEFT JOIN ambulances a ON a.driver_user_id=u.id WHERE u.driver_type='hospital_driver' AND u.hospital_id=$1 ORDER BY u.created_at DESC`, [hospitalId]);
  res.json({ success: true, data: result.rows });
};

exports.updateHospitalDriver = async (req, res) => {
  const scope = await hospitalForManager(req.user);
  if (scope.denied) return res.status(403).json({ success: false, message: 'Driver management permission required' });
  const hospitalId = Number(req.body.hospital_id || scope.hospitalId);
  if (!hospitalId || (!scope.superAdmin && hospitalId !== scope.hospitalId)) return res.status(403).json({ success: false, message: 'You cannot manage drivers for another hospital' });
  const status = clean(req.body.status).toLowerCase();
  if (!['suspended','deactivated','active'].includes(status)) return res.status(400).json({ success: false, message: 'Status must be active, suspended, or deactivated' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(`SELECT id,driver_status FROM users WHERE id=$1 AND hospital_id=$2 AND driver_type='hospital_driver' AND role='ambulance_driver' FOR UPDATE`, [req.params.driverId, hospitalId]);
    if (!found.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, message: 'Hospital driver not found' }); }
    if (status === 'active' && found.rows[0].driver_status === 'invited') { await client.query('ROLLBACK'); return res.status(409).json({ success: false, message: 'The driver must activate their invitation before staff can reactivate access' }); }
    if(status!=='active') { const trip=await client.query(`SELECT 1 FROM emergency_requests WHERE assigned_driver_user_id=$1 AND status NOT IN ('completed','resolved','cancelled') UNION ALL SELECT 1 FROM ambulance_bookings WHERE driver_user_id=$1 AND status NOT IN ('completed','cancelled') LIMIT 1`,[req.params.driverId]); if(trip.rowCount){await client.query('ROLLBACK');return res.status(409).json({success:false,message:'Complete or cancel the active trip before deactivating this driver'});} }
    await client.query(`UPDATE users SET driver_status=$1,account_status=$2,token_version=COALESCE(token_version,0)+1,updated_at=CURRENT_TIMESTAMP WHERE id=$3`, [status, status === 'active' ? 'ACTIVE' : status.toUpperCase(), req.params.driverId]);
    if (status !== 'active') await client.query(`UPDATE ambulances SET is_available=FALSE,status='OUT_OF_SERVICE' WHERE driver_user_id=$1`, [req.params.driverId]);
    else await client.query(`UPDATE ambulances SET is_available=TRUE,status='AVAILABLE' WHERE driver_user_id=$1 AND is_active=TRUE`,[req.params.driverId]);
    await client.query('COMMIT');
    if (status !== 'active') req.app.get('io')?.in(`driver_${req.params.driverId}`).disconnectSockets(true);
    res.json({ success: true, message: `Driver ${status}`, data: { driver_id: Number(req.params.driverId), driver_status: status } });
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); res.status(500).json({ success: false, message: 'Unable to update driver status' }); }
  finally { client.release(); }
};

exports.reassignHospitalDriver = async (req, res) => {
  const scope = await hospitalForManager(req.user);
  if (scope.denied) return res.status(403).json({ success: false, message: 'Driver management permission required' });
  const hospitalId = Number(req.body.hospital_id || scope.hospitalId);
  if (!hospitalId || (!scope.superAdmin && hospitalId !== scope.hospitalId)) return res.status(403).json({ success: false, message: 'You cannot manage another hospital' });
  const ambulanceId = Number(req.body.ambulance_id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const driver = await client.query(`SELECT id,name,phone,driver_status FROM users WHERE id=$1 AND hospital_id=$2 AND driver_type='hospital_driver' FOR UPDATE`, [req.params.driverId, hospitalId]);
    const ambulance = await client.query(`SELECT id FROM ambulances WHERE id=$1 AND hospital_id=$2 AND is_active=TRUE AND driver_user_id IS NULL FOR UPDATE`, [ambulanceId, hospitalId]);
    if (!driver.rowCount || !ambulance.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ success: false, message: 'Driver or available ambulance was not found at this hospital' }); }
    const active = await client.query(`SELECT 1 FROM emergency_requests WHERE assigned_driver_user_id=$1 AND status NOT IN ('completed','resolved','cancelled') UNION ALL SELECT 1 FROM ambulance_bookings WHERE driver_user_id=$1 AND status NOT IN ('completed','cancelled') LIMIT 1`, [req.params.driverId]);
    if (active.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ success: false, message: 'Complete or cancel the active assignment before reassignment' }); }
    await client.query('UPDATE ambulances SET driver_user_id=NULL WHERE driver_user_id=$1', [req.params.driverId]);
    await client.query('UPDATE ambulances SET driver_user_id=$1,driver_name=$2,driver_phone=$3 WHERE id=$4', [req.params.driverId,driver.rows[0].name,driver.rows[0].phone,ambulanceId]);
    await client.query('COMMIT');
    req.app.get('io')?.in(`driver_${req.params.driverId}`).disconnectSockets(true);
    res.json({ success: true, data: { driver_id: Number(req.params.driverId), ambulance_id: ambulanceId } });
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); res.status(500).json({ success: false, message: 'Unable to reassign driver' }); }
  finally { client.release(); }
};

exports.activateHospitalInvitation = async (req, res) => {
  const token = clean(req.body.token);
  const password = req.body.password;
  if (!token || typeof password !== 'string' || password.length < 10) return res.status(400).json({ success: false, message: 'A valid invitation and password with at least 10 characters are required' });
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const passwordHash = await bcrypt.hash(password, 10);
  const result = await pool.query(`UPDATE users SET password_hash=$1,password_reset_required=FALSE,account_status='ACTIVE',driver_status='active',is_verified=TRUE,driver_invite_token_hash=NULL,driver_invite_expires_at=NULL,updated_at=CURRENT_TIMESTAMP
    WHERE driver_invite_token_hash=$2 AND driver_invite_expires_at>CURRENT_TIMESTAMP AND driver_type='hospital_driver' AND driver_status='invited' RETURNING id,name,email`, [passwordHash, hash]);
  if (!result.rowCount) return res.status(400).json({ success: false, message: 'Invitation is invalid, expired, or already used' });
  await pool.query(`UPDATE ambulances SET is_available=TRUE,status='AVAILABLE' WHERE driver_user_id=$1 AND is_active=TRUE`, [result.rows[0].id]);
  res.json({ success: true, message: 'Driver account activated. Sign in to the Ambulance Driver Portal.', data: result.rows[0] });
};

exports.registerPrivateDriver = async (req, res) => {
  const { name, email, phone, password, license_number, license_expiry, vehicle_number, vehicle_type, vehicle_make, vehicle_model, service_area, operating_location, documents } = req.body;
  const driver = { name: clean(name), email: clean(email).toLowerCase(), phone: clean(phone), license_number: clean(license_number), vehicle_number: clean(vehicle_number).toUpperCase(), vehicle_type: clean(vehicle_type), service_area: clean(service_area), operating_location: clean(operating_location) };
  if (!driver.name || !validEmail(driver.email) || !validPhone(driver.phone) || typeof password !== 'string' || password.length < 10 || !driver.license_number || !validDate(license_expiry) || !driver.vehicle_number || !driver.vehicle_type || !driver.service_area || !driver.operating_location) {
    return res.status(400).json({ success: false, message: 'Complete identity, verified contact details, license, vehicle, service area, and operating location. Password must have at least 10 characters.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const user = await client.query(`INSERT INTO users(name,email,phone,password_hash,user_type,role,is_verified,account_status,password_reset_required,driver_type,driver_status,driver_license_number,driver_license_expiry,driver_service_area,driver_operating_location,driver_vehicle_details,driver_verification_documents)
      VALUES($1,$2,$3,$4,'staff','ambulance_driver',FALSE,'PENDING_VERIFICATION',FALSE,'private_driver','pending_verification',$5,$6,$7,$8,$9::jsonb,$10::jsonb) RETURNING id,name,email,phone,driver_status`,
      [driver.name,driver.email,driver.phone,await bcrypt.hash(password,10),driver.license_number,license_expiry,driver.service_area,driver.operating_location,JSON.stringify({ registration_number: driver.vehicle_number, type: driver.vehicle_type, make: clean(vehicle_make), model: clean(vehicle_model) }),JSON.stringify(safeDocuments(documents))]);
    await client.query(`INSERT INTO ambulances(hospital_id,vehicle_number,driver_name,driver_phone,type,is_available,status,is_active,driver_user_id,private_operator_user_id,registration_document)
      VALUES(NULL,$1,$2,$3,$4,FALSE,'PENDING_VERIFICATION',FALSE,$5,$5,$6::jsonb)`, [driver.vehicle_number,driver.name,driver.phone,driver.vehicle_type,user.rows[0].id,JSON.stringify(safeDocuments(documents))]);
    await client.query('COMMIT');
    return res.status(201).json({ success: true, message: 'Application received. Sign-in and trip operations remain unavailable until an administrator verifies your license and vehicle.', data: user.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return res.status(error.code === '23505' ? 409 : 500).json({ success: false, message: error.code === '23505' ? 'Email, phone, or vehicle registration number is already in use' : 'Unable to submit private driver application' });
  } finally { client.release(); }
};

exports.listPrivateApplications = async (_req, res) => {
  const result = await pool.query(`SELECT id,name,email,phone,created_at,driver_status,driver_license_number,driver_license_expiry,driver_service_area,driver_operating_location,driver_vehicle_details,driver_verification_documents FROM users WHERE driver_type='private_driver' ORDER BY created_at DESC`);
  res.json({ success: true, data: result.rows });
};

exports.reviewPrivateApplication = async (req, res) => {
  const action = clean(req.body.action).toLowerCase();
  if (!['approve','reject','suspend','deactivate'].includes(action)) return res.status(400).json({ success: false, message: 'Action must be approve, reject, suspend, or deactivate' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const driver = await client.query(`SELECT id,driver_status FROM users WHERE id=$1 AND driver_type='private_driver' AND role='ambulance_driver' FOR UPDATE`, [req.params.driverId]);
    if (!driver.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, message: 'Private driver application not found' }); }
    const status = ({ approve: 'active', reject: 'rejected', suspend: 'suspended', deactivate: 'deactivated' })[action];
    if (action === 'approve' && !['pending_verification','suspended'].includes(driver.rows[0].driver_status)) { await client.query('ROLLBACK'); return res.status(409).json({ success: false, message: 'Application is not awaiting approval' }); }
    await client.query(`UPDATE users SET driver_status=$1,account_status=$2,is_verified=$3,driver_reviewed_by=$4,driver_reviewed_at=CURRENT_TIMESTAMP,driver_review_notes=$5,updated_at=CURRENT_TIMESTAMP WHERE id=$6`, [status,status === 'active' ? 'ACTIVE' : status.toUpperCase(),status === 'active',req.user.id,clean(req.body.notes).slice(0,1000)||null,req.params.driverId]);
    await client.query(`UPDATE ambulances SET is_active=$1,is_available=$1,status=$2 WHERE private_operator_user_id=$3`, [status === 'active',status === 'active' ? 'AVAILABLE' : status.toUpperCase(),req.params.driverId]);
    await client.query('COMMIT');
    if (status !== 'active') req.app.get('io')?.in(`driver_${req.params.driverId}`).disconnectSockets(true);
    res.json({ success: true, data: { driver_id: Number(req.params.driverId), driver_status: status } });
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); res.status(500).json({ success: false, message: 'Unable to review private driver application' }); }
  finally { client.release(); }
};

/* Development-only, idempotent seed data. Uses the same users/hospitals schema
 * and bcrypt password format as the normal hospital registration endpoint. */
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');

const hospitals = [
  ['Diyaa Multispeciality Hospital Chikodi','diyaamultispecialityhospitalchikodi@gmail.com',16.4218923783,74.5671635402,['General Medicine','General Surgery','Orthopedics','Gynecology & Obstetrics','Emergency Medicine']],
  ['MJ Hospital Chikodi','mjhospitalchikodi@gmail.com',16.4364785461,74.5869279429,['General Medicine','General Surgery','Orthopedics','Cardiology','Emergency Medicine']],
  ['Sri Satya Sai Hospital','srisatyasaihospital@gmail.com',16.4300334553,74.5837649967,['General Medicine','General Surgery','Cardiology','Neurology','Orthopedics']],
  ["Charati's Sadanand Omkar Trauma and Multispeciality Hospital",'charatissadanandomkartraumaandmultispecialityhospital@gmail.com',16.4284095858,74.5804322439,['Trauma Care','Orthopedics','General Surgery','Emergency Medicine','ICU / Critical Care']],
  ['Chidanand Patil Hospital','chidanandpatilhospital@gmail.com',16.4267188465,74.5829950837,['General Medicine','General Surgery','Orthopedics','Gynecology & Obstetrics']],
  ['KLE Dr Prabhakar Kore Hospital','kledrprabhakakorehospital@gmail.com',16.425781094468473,74.58725268144713,['General Medicine','General Surgery','Cardiology','Neurology','Orthopedics','Pediatrics','Gynecology & Obstetrics','Emergency Medicine']],
  ['Shree Padma Hospital','shreepadmahospital@gmail.com',16.4249543463,74.5740891791,['General Medicine','Gynecology & Obstetrics','Maternity','General Surgery']],
  ['Divyam Childrens Hospital','divyamchildrenshospital@gmail.com',16.4252876838,74.5821199509,['Pediatrics','Neonatology','Child Emergency Medicine']],
  ['Shri Sadguru Eye Hospital','shrisadgurueyehospital@gmail.com',16.4280598169,74.5838029221,['Ophthalmology','Eye Surgery']],
  ['General Government Hospital','generalgovthospital@gmail.com',16.4258354470,74.5758462644,['General Medicine','General Surgery','Orthopedics','Pediatrics','Gynecology & Obstetrics','Emergency Medicine']],
  ['Bhate Hospital and Maternity Home','bhatehospitalandmaternityhome@gmail.com',16.4257123193,74.5883903356,['Gynecology & Obstetrics','Maternity','General Medicine','Neonatology']],
  ['Shivkrupa Hospital','shivkrupahospital@gmail.com',16.4278214628,74.5808848940,['General Medicine','General Surgery','Orthopedics','Gynecology & Obstetrics']],
  ['Shraddha Hospital','shraddhahospital@gmail.com',16.4269991907,74.5839131644,['General Medicine','General Surgery','Orthopedics','Pediatrics']],
  ['Pandurang Kumbar Hospital','pandurangkumbarhospital@gmail.com',16.3679536043,74.6819825798,['General Medicine','General Surgery','Orthopedics']],
  ['Sanmeet Hospital','sanmeethospital@gmail.com',16.4249464202,74.5766871374,['General Medicine','General Surgery','Gynecology & Obstetrics','Orthopedics']],
  ['Darshan ENT Centre','darshanentcentre@gmail.com',16.4273815356,74.5833729337,['ENT','Head & Neck Surgery']],
];
const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];

async function ensureSchema(client) {
  await client.query(`ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS area VARCHAR(100), ADD COLUMN IF NOT EXISTS country VARCHAR(100), ADD COLUMN IF NOT EXISTS hospital_type VARCHAR(100), ADD COLUMN IF NOT EXISTS departments TEXT[] NOT NULL DEFAULT '{}', ADD COLUMN IF NOT EXISTS specialties TEXT[] NOT NULL DEFAULT '{}', ADD COLUMN IF NOT EXISTS services TEXT[] NOT NULL DEFAULT '{}', ADD COLUMN IF NOT EXISTS emergency_available BOOLEAN NOT NULL DEFAULT FALSE`);
  await client.query(`ALTER TABLE blood_bank ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_hospital_resources_hospital_id ON hospital_resources (hospital_id)`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_hospitals_registration_number ON hospitals (registration_number)`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_blood_bank_hospital_group ON blood_bank (hospital_id, blood_group)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_hospitals_specialties ON hospitals USING GIN (specialties)`);
}

async function seed() {
  const client = await pool.connect();
  let created = 0;
  try {
    await client.query('BEGIN');
    await ensureSchema(client);
    for (let index = 0; index < hospitals.length; index += 1) {
      const [name, email, latitude, longitude, specialties] = hospitals[index];
      const number = index + 1;
      const password = `${email.split('@')[0]}@123`;
      const passwordHash = await bcrypt.hash(password, 10);
      const user = await client.query(`INSERT INTO users (name, email, phone, password_hash, user_type, is_verified)
        VALUES ($1,$2,$3,$4,'hospital',true)
        ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name, phone=EXCLUDED.phone, password_hash=EXCLUDED.password_hash, user_type='hospital', is_verified=true, updated_at=CURRENT_TIMESTAMP
        RETURNING id`, [name, email, `90000000${String(number).padStart(2, '0')}`, passwordHash]);
      const emergency = specialties.includes('Emergency Medicine') || specialties.includes('Trauma Care') || number % 3 === 0;
      const icu = specialties.includes('ICU / Critical Care') || emergency || number % 4 === 0;
      const totalBeds = 30 + number * 5;
      const availableBeds = totalBeds - (number % 8 + 3);
      const totalIcu = icu ? 5 + number % 6 : 0;
      const availableIcu = icu ? Math.max(1, totalIcu - number % 3) : 0;
      const alreadyExists = await client.query('SELECT 1 FROM hospitals WHERE registration_number = $1', [`TEST-CHI-${String(number).padStart(3, '0')}`]);
      const profile = await client.query(`INSERT INTO hospitals (user_id,name,registration_number,address,area,city,state,country,pincode,hospital_type,departments,specialties,services,emergency_available,phone,email,latitude,longitude,is_verified,verification_status,rating)
        VALUES ($1,$2,$3,'Chikkodi, Karnataka, India','Chikkodi','Chikkodi','Karnataka','India','TEST-0000','Development test hospital',$4::jsonb,$5,$6::jsonb,$7,$8,$9,$10,$11,true,'verified',4.0)
        ON CONFLICT (registration_number) DO UPDATE SET user_id=EXCLUDED.user_id,name=EXCLUDED.name,address=EXCLUDED.address,area=EXCLUDED.area,city=EXCLUDED.city,state=EXCLUDED.state,country=EXCLUDED.country,pincode=EXCLUDED.pincode,departments=EXCLUDED.departments,specialties=EXCLUDED.specialties,services=EXCLUDED.services,emergency_available=EXCLUDED.emergency_available,phone=EXCLUDED.phone,email=EXCLUDED.email,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,is_verified=true,verification_status='verified',updated_at=CURRENT_TIMESTAMP
        RETURNING id`, [user.rows[0].id, name, `TEST-CHI-${String(number).padStart(3, '0')}`, JSON.stringify(specialties), specialties, JSON.stringify(['Emergency','Pharmacy','Laboratory','Radiology','X-Ray','Operation Theatre', ...(icu ? ['ICU'] : []), ...(emergency ? ['Ambulance'] : [])]), emergency, `90000000${String(number).padStart(2, '0')}`, email, latitude, longitude]);
      const hospitalId = profile.rows[0].id;
      await client.query(`INSERT INTO hospital_resources (hospital_id,general_beds_total,general_beds_available,icu_beds_total,icu_beds_available,ventilators_total,ventilators_available,oxygen_supported_beds_total,oxygen_supported_beds_available)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (hospital_id) DO UPDATE SET general_beds_total=EXCLUDED.general_beds_total,general_beds_available=EXCLUDED.general_beds_available,icu_beds_total=EXCLUDED.icu_beds_total,icu_beds_available=EXCLUDED.icu_beds_available,ventilators_total=EXCLUDED.ventilators_total,ventilators_available=EXCLUDED.ventilators_available,oxygen_supported_beds_total=EXCLUDED.oxygen_supported_beds_total,oxygen_supported_beds_available=EXCLUDED.oxygen_supported_beds_available,updated_at=CURRENT_TIMESTAMP`, [hospitalId,totalBeds,availableBeds,totalIcu,availableIcu,icu ? 4 : 1,icu ? 3 : 1,10 + number,8 + number]);
      if (number % 2 === 0 || emergency) for (const [group, offset] of bloodGroups.map((g, i) => [g, i])) await client.query(`INSERT INTO blood_bank (hospital_id,blood_group,units_available,minimum_threshold,batch_number) VALUES ($1,$2,$3,5,$4) ON CONFLICT (hospital_id,blood_group) DO UPDATE SET units_available=EXCLUDED.units_available,batch_number=EXCLUDED.batch_number,last_updated=CURRENT_TIMESTAMP`, [hospitalId, group, 5 + ((number + offset) % 12), `TEST-CHI-${String(number).padStart(3, '0')}-${group.replace(/[^A-Z]/g, 'P')}`]);
      const doctorEmail = `test.doctor.${String(number).padStart(2, '0')}@seed.invalid`;
      const existingDoctor = await client.query('SELECT id FROM doctors WHERE email=$1', [doctorEmail]);
      if (existingDoctor.rowCount) await client.query(`UPDATE doctors SET hospital_id=$1,name=$2,specialization=$3,qualification='Test data',experience_years=$4,is_active=false,availability_status=false,consultation_fee=$5,phone=$6 WHERE id=$7`, [hospitalId, `Dr. Test ${number}`, specialties[0], 3 + number % 12, 300 + number * 25, `91000000${String(number).padStart(2, '0')}`, existingDoctor.rows[0].id]);
      else await client.query(`INSERT INTO doctors (hospital_id,name,specialization,qualification,experience_years,is_active,availability_status,consultation_fee,phone,email) VALUES ($1,$2,$3,'Test data',$4,false,false,$5,$6,$7)`, [hospitalId, `Dr. Test ${number}`, specialties[0], 3 + number % 12, 300 + number * 25, `91000000${String(number).padStart(2, '0')}`, doctorEmail]);
      if (!alreadyExists.rowCount) created += 1;
    }
    await client.query('COMMIT');
    console.log(`Test hospitals seeded: ${created} created, ${hospitals.length - created} updated. No non-test records were changed.`);
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); await pool.end(); }
}
seed().catch((error) => { console.error('Hospital seed failed:', error.message); process.exitCode = 1; });

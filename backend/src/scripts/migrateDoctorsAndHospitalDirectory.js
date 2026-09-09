/* Idempotent migration for the supplied Chikkodi hospital directory data. */
require('dotenv').config();
const { pool } = require('../config/database');

const hospitals = [
  ['Diyaa Multispeciality Hospital', ['Diyaa Multispeciality Hospital Chikodi'], [
    ['Dr. Sanjeev A. Patil', 'Orthopedic Surgeon', 'MS (Ortho)', null, null, 'A compassionate humanitarian dedicated to bringing state-of-the-art healthcare services to the doorstep of each and every needy person.'],
    ['Dr. Prashant Rathod', 'General Medicine', 'MBBS, MD'], ['Dr. Ramesh Malavalli', 'General Medicine', 'MBBS, MD'], ['Dr. Sandhya S. Patil', 'Obstetrics and Gynecology', 'MS (OBG)'],
    ['Dr. Manjunath Kumbar', 'Orthopedics', 'MBBS, D.Ortho'], ['Dr. Nyruthya K M', 'Obstetrics and Gynecology', 'MBBS, MS'],
    ['Dr. Sattar Khan', 'Neuro Surgeon', 'MBBS, MS, M.Ch'], ['Dr. Shashikumar Hosagoudar', 'Orthopedics', 'MBBS, MS'],
    ['Dr. Subhash N. Halbhavi', 'General Surgery', 'MBBS, MS, FIAGES'], ['Dr. T. D. Berlin', 'Physiotherapy', 'Bachelor of Physiotherapy'],
    ['Dr. Chetan J. Shikhare', 'Obstetrics and Gynecology', 'MBBS, DGO']]],
  ['Shri Satya Sai Hospital', ['Sri Satya Sai Hospital', 'Sri Satya Sai Hospital Old Court Lane Chikodi'], [['Dr. Abhijit', 'Urologist', 'MBBS, MCh - Urology/Genito-Urinary Surgery']]],
  ['MJ Hospital', ['MJ Hospital Chikodi'], [['Dr. R. S. Jamadar', 'Cardiopulmonary; Diabetology; General Practice', null, 'Primary Doctor / Specialist']]],
  ["Charati's Sadanand Omkar Trauma & Multispeciality Hospital", [], [['Dr. Ajit V. Charati', 'Trauma and Orthopedics', null, null, null, 'Bone and joint fracture care; accident and emergency trauma management.']]],
  ['Shree Padma Hospital', [], [['Dr. Padmaraj C. Patil', 'Orthopedics and Trauma Surgery', "MBBS, D'Ortho, MCh"], ['Dr. Padmaja (Seema) P. Patil', 'Gynaecology and Obstetrics', 'MBBS, DGO']]],
  ['Shivkrupa Hospital', ['Shivkrupa Hospital Veer Savarkar Nagar Chikkodi'], [['Dr. Shridhar Kulkarni', 'Pediatrician / General Practice']]],
  ['Shraddha Hospital', ['Shraddha Hospital Kore Nagar Chikkodi'], [['Dr. Sudhir B. Patil', 'Gynaecologist & Obstetrician; Infertility Specialist', null, null, 36, null, '36+ years'], ['Dr. Pragati Patil', 'General Medicine Physician', null, null, 28, null, '28+ years']]],
  ['Pandurang Kumbar Hospital', ['Pandurang Kumbar Hospital Near Pandurang Temple Chikkodi'], [['Dr. Pandurang Kumbar', 'Ayurvedic / Traditional Medicine; Neurological condition care', null, 'Senior Consultant & Lead Specialist', null, 'Integrates traditional Nadi Parikshan (pulse diagnosis) with Ayurvedic formulations.'], ['Dr. Ravi', null, null, 'Consultant Physician'], ['Dr. Dnyaneshwar', null, null, 'Consultant Physician']]],
  ['Sanmeet Hospital', ['Sanmeet Hospital N M Road Chikkodi'], [['Dr. Sanjay S. Kasture', 'Consulting Paediatrician / Child Specialist', 'MBBS, DCH'], ['Dr. Arpana S. Kasture', 'General Practice / Maternity & Obstetric Care', 'MBBS']]],
];
// Facts published by KLE's Chikodi page on 2026-09-04.  The site's public
// doctor directory does not expose a Chikodi-specific roster, so no clinician
// records are manufactured from its general network directory.
const kleChikodi = {
  name: 'KLES Dr. Prabhakar Kore Hospital, Chikodi',
  aliases: ['KLE Dr. Prabhakar Kore Hospital & ICU Chikkodi', 'KLES ICU Chikkodi', 'KLE Hospital Chikodi'],
  address: 'Chikodi, Karnataka 591201',
  city: 'Chikodi',
  state: 'Karnataka',
  pincode: '591201',
  phone: '08338-274771, 72, 73, 74',
};
const publishedHospitalUpdates = [
  kleChikodi,
  {
    // Diyaa's supplied roster already appears above; this is its official
    // contact information, not a new or replacement doctor roster.
    name: 'Diyaa Multispeciality Hospital',
    aliases: ['Diyaa Hospital', 'Diyaa Hospitals'],
    address: 'TMC No. 6838/1/P22, Nipani-Mahalingpur Road, Chikodi, Karnataka 591201',
    city: 'Chikodi', state: 'Karnataka', pincode: '591201',
    phone: '08338-275999', email: 'info@diyaahospital.com',
  },
  {
    name: "Charati's Sadanand Omkar Trauma & Multispeciality Hospital",
    aliases: ['Charati Sadanand Omkar Trauma And Multispeciality Hospital'],
    address: 'KC Road, Veer Savarkar Nagar, Chikodi, Karnataka 591201',
    city: 'Chikodi', state: 'Karnataka', pincode: '591201', phone: '08338-272617',
  },
  {
    name: 'Bhate Hospital And Maternity Home',
    aliases: ['Bhate Hospital & Maternity Home', 'Bhate Hospital And Maternity Home Chikodi'],
    address: '1243, Basaveshwar Circle, Near Head Post Office, Chikodi, Karnataka 591201',
    city: 'Chikodi', state: 'Karnataka', pincode: '591201', phone: '08338-272178',
  },
];
const norm = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

async function main() {
  await pool.query(`ALTER TABLE doctors
    ADD COLUMN IF NOT EXISTS designation TEXT,
    ADD COLUMN IF NOT EXISTS department TEXT,
    ADD COLUMN IF NOT EXISTS experience_display TEXT,
    ADD COLUMN IF NOT EXISTS registration_number TEXT,
    ADD COLUMN IF NOT EXISTS availability TEXT,
    ADD COLUMN IF NOT EXISTS profile_image TEXT,
    ADD COLUMN IF NOT EXISTS bio TEXT,
    ADD COLUMN IF NOT EXISTS verification_status VARCHAR(80) DEFAULT 'HOSPITAL_CONFIRMATION_REQUIRED',
    ADD COLUMN IF NOT EXISTS source_url TEXT,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
  // Directory records may legitimately have no supplied address or registration
  // number.  Keep those facts NULL rather than manufacturing credentials.
  await pool.query(`ALTER TABLE hospitals ALTER COLUMN address DROP NOT NULL, ALTER COLUMN registration_number DROP NOT NULL, ADD COLUMN IF NOT EXISTS directory_visible BOOLEAN NOT NULL DEFAULT FALSE`);
  // Some verified hospital contact lines list multiple extension numbers and
  // cannot be faithfully stored in the legacy 20-character phone field.
  await pool.query(`ALTER TABLE hospitals ALTER COLUMN phone TYPE TEXT`);
  // Development fixture doctors must never be surfaced as real providers.
  await pool.query(`UPDATE doctors SET is_active=false, availability_status=false
    WHERE email LIKE '%@seed.invalid'`);
  // Earlier directory imports could have inserted the same source doctor more
  // than once. Preserve appointment history by moving it to the oldest record
  // before removing only the duplicate rows.
  const duplicates = await pool.query(`SELECT hospital_id,
      lower(regexp_replace(name, '[^a-zA-Z0-9]', '', 'g')) normalized_name,
      array_agg(id ORDER BY id) ids
    FROM doctors GROUP BY hospital_id, lower(regexp_replace(name, '[^a-zA-Z0-9]', '', 'g'))
    HAVING COUNT(*) > 1`);
  for (const duplicate of duplicates.rows) {
    const [keeper, ...redundant] = duplicate.ids.map(Number);
    if (!redundant.length) continue;
    await pool.query('UPDATE appointments SET doctor_id=$1 WHERE doctor_id = ANY($2::int[])', [keeper, redundant]);
    await pool.query('DELETE FROM doctors WHERE id = ANY($1::int[])', [redundant]);
  }
  await pool.query(`DROP INDEX IF EXISTS idx_doctors_hospital_name_normalized`);
  await pool.query(`CREATE UNIQUE INDEX idx_doctors_hospital_name_normalized ON doctors (hospital_id, lower(regexp_replace(name, '[^a-zA-Z0-9]', '', 'g')))`);
  let inserted = 0, updated = 0, missingHospitals = [];
  for (const [name, aliases, doctors] of hospitals) {
    const candidates = [name, ...aliases].map(norm);
    const found = await pool.query(`SELECT id, name FROM hospitals WHERE lower(regexp_replace(name, '[^a-zA-Z0-9]', '', 'g')) = ANY($1::text[]) ORDER BY id LIMIT 1`, [candidates]);
    let hospital = found.rows[0];
    if (!hospital) {
      const created = await pool.query(`INSERT INTO hospitals (name, address, registration_number, verification_status, is_verified, directory_visible)
        VALUES ($1, NULL, NULL, 'directory_unverified', false, true) RETURNING id, name`, [name]);
      hospital = created.rows[0];
    }
    await pool.query(`UPDATE hospitals SET directory_visible = true,
      verification_status = CASE WHEN is_verified THEN verification_status ELSE 'directory_unverified' END
      WHERE id = $1`, [hospital.id]);
    if (name === "Charati's Sadanand Omkar Trauma & Multispeciality Hospital") {
      const types = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='hospitals' AND column_name IN ('specialties', 'services')`);
      const columnTypes = Object.fromEntries(types.rows.map((row) => [row.column_name, row.data_type]));
      const specialtyValues = ['Trauma and Orthopedics', 'Dermatology / Skin Care'];
      const serviceValues = ['Bone and joint fracture care', 'Accident and emergency trauma management', 'Skin, hair and laser treatments'];
      const updateDirectoryField = async (field, values) => {
        if (columnTypes[field] === 'jsonb') {
          await pool.query(`UPDATE hospitals SET ${field}=COALESCE(${field}, '[]'::jsonb) || $1::jsonb WHERE id=$2`, [JSON.stringify(values), hospital.id]);
        } else {
          await pool.query(`UPDATE hospitals SET ${field}=ARRAY(SELECT DISTINCT unnest(COALESCE(${field}, '{}') || $1::text[])) WHERE id=$2`, [values, hospital.id]);
        }
      };
      await updateDirectoryField('specialties', specialtyValues);
      await updateDirectoryField('services', serviceValues);
    }
    for (const [doctorName, specialization = null, qualification = null, designation = null, experienceYears = null, bio = null, experienceDisplay = null] of doctors) {
      const existing = await pool.query(`SELECT id FROM doctors WHERE hospital_id=$1 AND lower(regexp_replace(name, '[^a-zA-Z0-9]', '', 'g'))=$2 LIMIT 1`, [hospital.id, norm(doctorName)]);
      const values = [specialization, qualification, designation, experienceYears, experienceDisplay, bio, doctorName, hospital.id];
      if (existing.rowCount) {
        await pool.query(`UPDATE doctors SET name=$7, specialization=COALESCE($1,specialization), qualification=COALESCE($2,qualification), designation=COALESCE($3,designation), experience_years=COALESCE($4,experience_years), experience_display=COALESCE($5,experience_display), bio=COALESCE($6,bio), is_active=true, availability_status=true, verification_status=COALESCE(verification_status,'HOSPITAL_CONFIRMATION_REQUIRED'), updated_at=CURRENT_TIMESTAMP WHERE id=$8`, [...values.slice(0, 7), existing.rows[0].id]); updated++;
      } else {
        await pool.query(`INSERT INTO doctors (hospital_id,name,specialization,qualification,designation,experience_years,experience_display,bio,is_active,availability_status,verification_status) VALUES ($8,$7,$1,$2,$3,$4,$5,$6,true,true,'HOSPITAL_CONFIRMATION_REQUIRED')`, values); inserted++;
      }
    }
  }
  // Match all known public names before creating a record, so existing doctor
  // and appointment references stay attached to their current hospital id.
  for (const hospitalUpdate of publishedHospitalUpdates) {
    const candidates = [hospitalUpdate.name, ...hospitalUpdate.aliases].map(norm);
    const existingHospital = await pool.query(`SELECT id FROM hospitals
      WHERE lower(regexp_replace(name, '[^a-zA-Z0-9]', '', 'g')) = ANY($1::text[])
      ORDER BY id LIMIT 1`, [candidates]);
    if (existingHospital.rowCount) {
      await pool.query(`UPDATE hospitals SET name=$1, address=$2, city=$3, state=$4,
        pincode=$5, phone=$6, email=COALESCE($7, email), directory_visible=true,
        verification_status=CASE WHEN is_verified THEN verification_status ELSE 'directory_unverified' END
        WHERE id=$8`, [hospitalUpdate.name, hospitalUpdate.address, hospitalUpdate.city,
        hospitalUpdate.state, hospitalUpdate.pincode, hospitalUpdate.phone,
        hospitalUpdate.email || null, existingHospital.rows[0].id]);
    } else {
      await pool.query(`INSERT INTO hospitals
        (name, address, city, state, pincode, phone, email, registration_number, verification_status, is_verified, directory_visible)
        VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,'directory_unverified',false,true)`,
      [hospitalUpdate.name, hospitalUpdate.address, hospitalUpdate.city, hospitalUpdate.state,
        hospitalUpdate.pincode, hospitalUpdate.phone, hospitalUpdate.email || null]);
    }
  }
  console.log(JSON.stringify({ inserted, updated, missingHospitals, message: 'No schedules, contacts, fees, registrations, or unprovided qualifications were populated.' }, null, 2));
  await pool.end();
}
main().catch(async (error) => { console.error(error); await pool.end(); process.exitCode = 1; });

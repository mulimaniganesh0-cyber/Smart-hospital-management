const { pool } = require('../config/database');

// This is the single representation used at the API boundary.  Keep this
// list independent of whatever spelling was used by legacy rows.
const BLOOD_GROUPS = Object.freeze(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']);

function normalizeBloodGroup(value) {
  if (typeof value !== 'string') return null;
  // Deliberately retain `-`: removing it turns every negative group into an
  // unrecognised value and makes real inventory appear to be missing.
  const compact = value.trim().toUpperCase().replace(/[\s._]+/g, '');
  const match = compact.match(/^(AB|A|B|O)(\+|\-|POSITIVE|NEGATIVE|POS|NEG|PLUS|MINUS|\+VE|\-VE)$/);
  if (!match) return null;
  const sign = ['+', 'POSITIVE', 'POS', 'PLUS', '+VE'].includes(match[2]) ? '+' : '-';
  return `${match[1]}${sign}`;
}

function emptyStock() {
  return new Map(BLOOD_GROUPS.map((bloodGroup) => [bloodGroup, 0]));
}

function rowsToStock(rows) {
  const stock = emptyStock();
  for (const row of rows) {
    const bloodGroup = normalizeBloodGroup(row.blood_group);
    if (!bloodGroup) continue; // unsupported legacy data must not be relabelled.
    const units = Number(row.units_available);
    stock.set(bloodGroup, stock.get(bloodGroup) + (Number.isFinite(units) ? units : 0));
  }
  return BLOOD_GROUPS.map((bloodGroup) => ({
    blood_group: bloodGroup,
    bloodGroup,
    units_available: stock.get(bloodGroup),
    units: stock.get(bloodGroup),
  }));
}

async function assertHospital(hospitalId) {
  const result = await pool.query('SELECT id, name FROM hospitals WHERE id = $1', [hospitalId]);
  if (!result.rows[0]) {
    const error = new Error('Hospital not found');
    error.code = 'HOSPITAL_NOT_FOUND';
    throw error;
  }
  return result.rows[0];
}

async function getHospitalBloodStock(hospitalId) {
  const id = Number(hospitalId);
  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error('Invalid hospital ID');
    error.code = 'INVALID_HOSPITAL_ID';
    throw error;
  }
  const hospital = await assertHospital(id);
  const result = await pool.query(
    'SELECT blood_group, units_available FROM blood_bank WHERE hospital_id = $1', [id]
  );
  return { hospital, bloodStock: rowsToStock(result.rows), databaseRowCount: result.rows.length };
}

async function getVisibleHospitalBloodStock(city) {
  const params = [];
  let where = 'WHERE h.is_verified = true';
  if (city) {
    params.push(`%${city}%`);
    where += ` AND h.city ILIKE $${params.length}`;
  }
  const hospitals = await pool.query(
    `SELECT h.id, h.name, h.address, h.city, h.phone FROM hospitals h ${where} ORDER BY h.name`, params
  );
  const ids = hospitals.rows.map((hospital) => hospital.id);
  const stockRows = ids.length
    ? await pool.query('SELECT hospital_id, blood_group, units_available FROM blood_bank WHERE hospital_id = ANY($1::int[])', [ids])
    : { rows: [] };
  const byHospital = new Map(ids.map((id) => [id, []]));
  stockRows.rows.forEach((row) => byHospital.get(row.hospital_id)?.push(row));
  return hospitals.rows.map((hospital) => ({
    ...hospital,
    bloodStock: rowsToStock(byHospital.get(hospital.id) || []),
  }));
}

module.exports = { BLOOD_GROUPS, normalizeBloodGroup, getHospitalBloodStock, getVisibleHospitalBloodStock };

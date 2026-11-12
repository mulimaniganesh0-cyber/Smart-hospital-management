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
  return new Map(BLOOD_GROUPS.map((bloodGroup) => [bloodGroup, {
    units: 0,
    batches: [],
    expiryDate: null,
    minimumThreshold: 10,
  }]));
}

function rowsToStock(rows) {
  const stock = emptyStock();
  for (const row of rows) {
    const bloodGroup = normalizeBloodGroup(row.blood_group);
    if (!bloodGroup) continue; // unsupported legacy data must not be relabelled.
    const group = stock.get(bloodGroup);
    const units = Number(row.units_available ?? row.units);
    if (Number.isFinite(units) && units >= 0 && row.batch_id != null) {
      group.batches.push({
        id: Number(row.batch_id),
        blood_bank_id: Number(row.blood_bank_id),
        batch_number: row.batch_number,
        units_available: units,
        expiry_date: row.expiry_date,
        donation_date: row.donation_date,
        donor_name: row.donor_name,
        donor_phone: row.donor_phone,
      });
      const isAvailable = row.is_available ??
        (!row.expiry_date || new Date(row.expiry_date).getTime() >= Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`));
      if (units > 0 && isAvailable) {
        group.units += units;
        if (row.expiry_date && (!group.expiryDate || row.expiry_date < group.expiryDate)) {
          group.expiryDate = row.expiry_date;
        }
      }
    } else if (Number.isFinite(units)) {
      // Compatibility for callers/tests that still provide aggregate records.
      group.units += units;
    }
    if (row.minimum_threshold != null) group.minimumThreshold = Number(row.minimum_threshold);
  }
  return BLOOD_GROUPS.map((bloodGroup) => {
    const group = stock.get(bloodGroup);
    return {
      blood_group: bloodGroup,
      bloodGroup,
      units_available: group.units,
      units: group.units,
      expiry_date: group.expiryDate,
      minimum_threshold: group.minimumThreshold,
      batches: group.batches,
    };
  });
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
    `SELECT b.id AS batch_id, b.blood_bank_id, b.blood_group, b.batch_number,
            b.units_available, b.expiry_date, b.donation_date, b.donor_name,
            b.donor_phone, bb.minimum_threshold,
            (b.expiry_date IS NULL OR b.expiry_date >= CURRENT_DATE) AS is_available
     FROM blood_inventory_batches b
     JOIN blood_bank bb ON bb.id = b.blood_bank_id
     WHERE b.hospital_id = $1
     ORDER BY b.blood_group, b.expiry_date NULLS LAST, b.created_at, b.id`, [id]
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
    ? await pool.query(`SELECT b.hospital_id, b.blood_group, b.units_available
        FROM blood_inventory_batches b WHERE b.hospital_id = ANY($1::int[])
          AND (b.expiry_date IS NULL OR b.expiry_date >= CURRENT_DATE)`, [ids])
    : { rows: [] };
  const byHospital = new Map(ids.map((id) => [id, []]));
  stockRows.rows.forEach((row) => byHospital.get(row.hospital_id)?.push(row));
  return hospitals.rows.map((hospital) => ({
    ...hospital,
    bloodStock: rowsToStock(byHospital.get(hospital.id) || []),
  }));
}

module.exports = { BLOOD_GROUPS, normalizeBloodGroup, getHospitalBloodStock, getVisibleHospitalBloodStock };

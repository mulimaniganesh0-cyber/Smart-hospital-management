// One-time reference snapshot supplied for this college/demo project.
// Each row is addressed by the already-existing primary key AND rechecked
// against its stored name and Chikkodi location before it is updated.
const { pool } = require('../config/database');

const references = [
  { id: 5, name: 'Diyaa Multispeciality Hospital Chikodi', rating: 4.6, reviews: 256 },
  { id: 6, name: 'MJ Hospital Chikodi', rating: 4.9, reviews: 218 },
  { id: 7, name: 'Sri Satya Sai Hospital', rating: 4.9, reviews: 183 },
  { id: 8, name: "Charati's Sadanand Omkar Trauma and Multispeciality Hospital", rating: 4.7, reviews: 420 },
  { id: 9, name: 'Chidanand Patil Hospital', rating: 4.4, reviews: 34 },
  { id: 10, name: 'KLE Dr Prabhakar Kore Hospital', rating: 3.1, reviews: 56 },
  { id: 11, name: 'Shree Padma Hospital', rating: 4.9, reviews: 28 },
  { id: 12, name: 'Divyam Childrens Hospital', rating: 5.0, reviews: 41 },
  { id: 13, name: 'Shri Sadguru Eye Hospital', rating: null, reviews: null },
  { id: 14, name: 'General Government Hospital', rating: 3.6, reviews: 19 },
  { id: 15, name: 'Bhate Hospital and Maternity Home', rating: 3.7, reviews: 36 },
  { id: 16, name: 'Shivkrupa Hospital', rating: null, reviews: null },
  { id: 17, name: 'Shraddha Hospital', rating: 3.8, reviews: 18 },
  { id: 18, name: 'Pandurang Kumbar Hospital', rating: 4.3, reviews: 1075 },
  { id: 19, name: 'Sanmeet Hospital', rating: null, reviews: null },
  { id: 20, name: 'Darshan ENT Centre', rating: 4.1, reviews: 39 },
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const reference of references) {
      const existing = await client.query('SELECT id, name, city, latitude, longitude FROM hospitals WHERE id=$1 FOR UPDATE', [reference.id]);
      const hospital = existing.rows[0];
      if (!hospital || hospital.name !== reference.name || !/chik+odi/i.test(hospital.city || '') || hospital.latitude == null || hospital.longitude == null) {
        throw new Error(`Hospital ID ${reference.id} does not match the expected Chikkodi record`);
      }
      await client.query(`UPDATE hospitals SET google_rating=$1, google_review_count=$2,
        google_place_id=NULL, google_maps_url=NULL, rating_source=$3, rating_verified=$4,
        rating_last_updated=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$5`, [
        reference.rating, reference.reviews,
        reference.rating === null ? null : 'Google Maps - reference',
        reference.rating !== null, reference.id,
      ]);
    }
    await client.query('COMMIT');
    console.log(`Google rating reference snapshot applied to ${references.length} existing hospitals.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); await pool.end(); }
}

seed().catch((error) => { console.error(error.message); process.exitCode = 1; });

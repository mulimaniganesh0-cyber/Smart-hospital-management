// src/services/hospitalSearchService.js
const { Pool } = require('pg');

class HospitalSearchService {
  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });
  }

  async searchHospitals(condition, latitude, longitude, radius = 20) {
    const client = await this.pool.connect();

    try {
      // First, check if the hospitals table has the required columns
      const columnsCheck = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'hospitals' 
        AND column_name IN ('latitude', 'longitude', 'specialties', 'active', 'is_verified')
      `);

      const existingColumns = columnsCheck.rows.map(r => r.column_name);
      
      // Build query dynamically based on existing columns
      let distanceFormula = '0';
      let hasLocation = existingColumns.includes('latitude') && existingColumns.includes('longitude');
      
      if (hasLocation && latitude && longitude) {
        distanceFormula = `
          (6371 * acos(
            cos(radians(${latitude})) * cos(radians(CAST(h.latitude AS FLOAT))) *
            cos(radians(CAST(h.longitude AS FLOAT)) - radians(${longitude})) +
            sin(radians(${latitude})) * sin(radians(CAST(h.latitude AS FLOAT)))
          ))
        `;
      }

      const query = `
        SELECT 
          h.id,
          h.name,
          h.address,
          h.rating,
          h.phone,
          h.is_verified,
          h.specialties,
          ${distanceFormula} AS distance_km,
          COALESCE(r.general_beds_available, 0) as available_beds,
          COALESCE(r.icu_beds_available, 0) as available_icu,
          COALESCE(r.ventilators_available, 0) as available_ventilators,
          COALESCE(r.oxygen_beds_available, 0) as available_oxygen,
          COALESCE(r.blood_units_available, 0) as blood_units
        FROM hospitals h
        LEFT JOIN hospital_resources r ON h.id = r.hospital_id
        WHERE h.is_verified = true
        ${existingColumns.includes('active') ? 'AND h.active = true' : ''}
        ${hasLocation && latitude && longitude ? `HAVING distance_km <= ${radius}` : ''}
        ORDER BY 
          CASE WHEN h.specialties IS NOT NULL AND h.specialties::text ILIKE '%${condition || ''}%' THEN 3 ELSE 1 END DESC,
          distance_km ASC,
          available_beds DESC
        LIMIT 10
      `;

      const result = await client.query(query);
      return result.rows;
    } catch (error) {
      console.error('Hospital search error:', error);
      
      // Fallback: Return basic hospital data without distance
      try {
        const fallbackQuery = `
          SELECT 
            h.id,
            h.name,
            h.address,
            h.rating,
            h.phone,
            h.is_verified,
            h.specialties,
            0 as distance_km,
            COALESCE(r.general_beds_available, 0) as available_beds,
            COALESCE(r.icu_beds_available, 0) as available_icu,
            COALESCE(r.ventilators_available, 0) as available_ventilators,
            COALESCE(r.oxygen_beds_available, 0) as available_oxygen,
            COALESCE(r.blood_units_available, 0) as blood_units
          FROM hospitals h
          LEFT JOIN hospital_resources r ON h.id = r.hospital_id
          WHERE h.is_verified = true
          LIMIT 10
        `;
        const fallbackResult = await client.query(fallbackQuery);
        return fallbackResult.rows;
      } catch (fallbackError) {
        console.error('Fallback query error:', fallbackError);
        return [];
      }
    } finally {
      client.release();
    }
  }

  async getEmergencyContacts() {
    try {
      // Check if emergency_contacts table exists
      const tableCheck = await this.pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'emergency_contacts'
        )
      `);
      
      if (tableCheck.rows[0].exists) {
        const query = `
          SELECT 
            id,
            name,
            number,
            type,
            description,
            priority
          FROM emergency_contacts 
          WHERE is_active = true
          ORDER BY priority ASC
        `;
        const result = await this.pool.query(query);
        return result.rows.length > 0 ? result.rows : this.getDefaultEmergencyContacts();
      }
      return this.getDefaultEmergencyContacts();
    } catch (error) {
      console.error('Emergency contacts error:', error);
      return this.getDefaultEmergencyContacts();
    }
  }

  getDefaultEmergencyContacts() {
    return [
      { name: 'Emergency Ambulance', number: '108', type: 'ambulance', description: 'National Emergency Ambulance Service' },
      { name: 'Police Emergency', number: '112', type: 'police', description: 'National Police Emergency' },
      { name: 'Fire Emergency', number: '101', type: 'fire', description: 'National Fire Service' },
    ];
  }

  async getBloodAvailability() {
    try {
      // Check if blood_inventory table exists
      const tableCheck = await this.pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'blood_inventory'
        )
      `);
      
      if (tableCheck.rows[0].exists) {
        const query = `
          SELECT 
            blood_group,
            units_available,
            minimum_threshold
          FROM blood_inventory
          WHERE units_available > 0
          ORDER BY blood_group ASC
        `;
        const result = await this.pool.query(query);
        return result.rows;
      }
      return [];
    } catch (error) {
      console.error('Blood availability error:', error);
      return [];
    }
  }

  async getAllHospitals(verifiedOnly = true) {
    const client = await this.pool.connect();
    try {
      const query = `
        SELECT 
          h.id,
          h.name,
          h.address,
          h.latitude,
          h.longitude,
          h.rating,
          h.phone,
          h.email,
          h.is_verified,
          h.specialties,
          COALESCE(r.general_beds_available, 0) as general_beds,
          COALESCE(r.icu_beds_available, 0) as icu_beds,
          COALESCE(r.ventilators_available, 0) as ventilators,
          COALESCE(r.oxygen_beds_available, 0) as oxygen_beds,
          COALESCE(r.blood_units_available, 0) as blood_units
        FROM hospitals h
        LEFT JOIN hospital_resources r ON h.id = r.hospital_id
        ${verifiedOnly ? 'WHERE h.is_verified = true' : ''}
        ORDER BY h.name ASC
      `;
      const result = await client.query(query);
      return result.rows;
    } catch (error) {
      console.error('Get all hospitals error:', error);
      return [];
    } finally {
      client.release();
    }
  }
}

module.exports = new HospitalSearchService();
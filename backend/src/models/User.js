// src/models/User.js
const { pool } = require('../config/database');

class User {
  static async create(userData) {
    const { name, email, phone, password_hash, user_type } = userData;
    const result = await pool.query(
      `INSERT INTO users (name, email, phone, password_hash, user_type, is_verified)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, email, phone, user_type, is_verified, created_at`,
      [name, email, phone, password_hash, user_type, false]
    );
    return result.rows[0];
  }

  static async findByEmail(email) {
    const result = await pool.query(
      // Read driver metadata from the row JSON so older databases can still
      // authenticate existing non-driver users while the driver migration is pending.
      `SELECT u.id, u.name, u.email, u.phone, u.password_hash, u.user_type, u.role, u.hospital_role, u.permissions, u.hospital_id, u.is_verified, u.account_status, u.password_reset_required,
              to_jsonb(u)->>'driver_type' AS driver_type, to_jsonb(u)->>'driver_status' AS driver_status, u.created_at
       FROM users u WHERE u.email = $1`,
      [email]
    );
    return result.rows[0];
  }

  static async findByLogin(identifier) {
    const value = String(identifier || '').trim();
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.phone, u.password_hash, u.user_type, u.role, u.hospital_role, u.permissions, u.hospital_id, u.is_verified, u.account_status, u.password_reset_required,
              to_jsonb(u)->>'driver_type' AS driver_type, to_jsonb(u)->>'driver_status' AS driver_status, COALESCE(to_jsonb(u)->>'token_version','0')::int AS token_version, u.created_at
       FROM users u WHERE lower(u.email) = lower($1) OR (length(regexp_replace($1,'[^0-9]','','g')) BETWEEN 8 AND 15 AND regexp_replace(COALESCE(u.phone,''),'[^0-9]','','g') = regexp_replace($1,'[^0-9]','','g')) LIMIT 2`,
      [value]
    );
    return result.rows.length === 1 ? result.rows[0] : null;
  }

  static async findById(id) {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.phone, u.user_type, u.role, u.hospital_role, u.permissions, u.hospital_id, u.is_verified, u.account_status, u.password_reset_required, COALESCE(to_jsonb(u)->>'token_version','0')::int AS token_version,
              to_jsonb(u)->>'driver_type' AS driver_type, to_jsonb(u)->>'driver_status' AS driver_status, u.created_at
       FROM users u WHERE u.id = $1`,
      [id]
    );
    return result.rows[0];
  }

  static async update(id, updates) {
    const fields = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = fields.map((field, i) => `${field} = $${i + 2}`).join(', ');
    
    const result = await pool.query(
      `UPDATE users SET ${setClause}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING id, name, email, phone, user_type, is_verified`,
      [id, ...values]
    );
    return result.rows[0];
  }

  static async delete(id) {
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    return true;
  }

  static async getAll(page = 1, limit = 10, userType = null) {
    let query = 'SELECT id, name, email, phone, user_type, is_verified, created_at FROM users';
    let params = [];
    
    if (userType) {
      query += ' WHERE user_type = $1';
      params.push(userType);
    }
    
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, (page - 1) * limit);
    
    const result = await pool.query(query, params);
    return result.rows;
  }
}

module.exports = User;

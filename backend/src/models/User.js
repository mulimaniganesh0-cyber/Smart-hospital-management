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
      'SELECT id, name, email, phone, password_hash, user_type, role, hospital_role, permissions, hospital_id, is_verified, created_at FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0];
  }

  static async findById(id) {
    const result = await pool.query(
      'SELECT id, name, email, phone, user_type, role, hospital_role, permissions, hospital_id, is_verified, created_at FROM users WHERE id = $1',
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

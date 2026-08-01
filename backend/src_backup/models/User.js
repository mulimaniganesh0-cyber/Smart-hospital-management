// src/models/User.js
const db = require('../config/database');

class User {
    static async create(userData) {
        const { name, email, password_hash, user_type, phone } = userData;
        
        const result = await db.query(
            `INSERT INTO users (name, email, password_hash, user_type, phone, is_verified, created_at)
             VALUES ($1, $2, $3, $4, $5, false, CURRENT_TIMESTAMP)
             RETURNING id, name, email, user_type, phone, is_verified, created_at`,
            [name, email, password_hash, user_type, phone || null]
        );
        
        return result.rows[0];
    }

    static async findByEmail(email) {
        const result = await db.query(
            'SELECT * FROM users WHERE email = $1',
            [email.toLowerCase().trim()]
        );
        return result.rows[0] || null;
    }

    static async findById(id) {
        const result = await db.query(
            'SELECT * FROM users WHERE id = $1',
            [id]
        );
        return result.rows[0] || null;
    }

    static async update(id, updates) {
        const fields = [];
        const values = [];
        let paramCount = 1;

        for (const [key, value] of Object.entries(updates)) {
            if (value !== undefined) {
                fields.push(`${key} = $${paramCount}`);
                values.push(value);
                paramCount++;
            }
        }

        if (fields.length === 0) return null;

        values.push(id);
        const query = `
            UPDATE users 
            SET ${fields.join(', ')} 
            WHERE id = $${paramCount} 
            RETURNING id, name, email, user_type, phone, is_verified, created_at
        `;

        const result = await db.query(query, values);
        return result.rows[0] || null;
    }

    static async delete(id) {
        const result = await db.query(
            'DELETE FROM users WHERE id = $1 RETURNING id',
            [id]
        );
        return result.rows[0] || null;
    }

    static async getAll(limit = 100, offset = 0) {
        const result = await db.query(
            `SELECT id, name, email, user_type, phone, is_verified, created_at, last_login
             FROM users 
             ORDER BY created_at DESC 
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );
        return result.rows;
    }

    static async count() {
        const result = await db.query('SELECT COUNT(*) as total FROM users');
        return parseInt(result.rows[0].total);
    }
}

module.exports = User;
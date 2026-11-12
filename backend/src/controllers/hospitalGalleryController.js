const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');
const { pool } = require('../config/database');

const CATEGORIES = new Set(['exterior', 'entrance', 'emergency', 'ward', 'icu', 'laboratory', 'pharmacy', 'other']);
const STORAGE_ROOT = path.resolve(process.env.HOSPITAL_GALLERY_STORAGE_DIR || path.join(__dirname, '../../private_uploads/hospital-gallery'));
const MAX_PHOTOS = 100;

function imageUrls(hospitalId, photoId) {
  const base = `/api/hospitals/${hospitalId}/photos/${photoId}/image`;
  return { image_url: base, thumbnail_url: `${base}?size=thumbnail` };
}

function metadata(row) {
  return { ...row, ...imageUrls(row.hospital_id, row.id) };
}

function sendError(res, status, message) {
  return res.status(status).json({ success: false, message });
}

function parseId(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function validateMetadata(body, { allowPublication = true } = {}) {
  const values = {};
  if (Object.hasOwn(body, 'caption')) {
    if (typeof body.caption !== 'string' || body.caption.trim().length > 200) return { error: 'Caption must be 200 characters or fewer.' };
    values.caption = body.caption.trim();
  }
  if (Object.hasOwn(body, 'category')) {
    if (!CATEGORIES.has(body.category)) return { error: 'Unsupported photo category.' };
    values.category = body.category;
  }
  if (Object.hasOwn(body, 'display_order')) {
    const order = Number(body.display_order);
    if (!Number.isInteger(order) || order < 0 || order > 10000) return { error: 'Display order must be a whole number from 0 to 10000.' };
    values.display_order = order;
  }
  for (const field of ['is_cover', 'is_published']) {
    if (field === 'is_published' && !allowPublication) continue;
    if (Object.hasOwn(body, field)) {
      if (typeof body[field] !== 'boolean') return { error: `${field} must be a boolean.` };
      values[field] = body[field];
    }
  }
  return { values };
}

function createHospitalGalleryController({
  database = pool,
  storageRoot = STORAGE_ROOT,
  imageProcessor = sharp,
  fileSystem = fs,
} = {}) {
  async function resolveHospital(userId) {
    const result = await database.query(
      `SELECT h.id FROM hospitals h
       JOIN users u ON u.id = $1
       WHERE h.user_id = u.id
          OR (h.id = u.hospital_id AND (u.role = 'hospital_admin' OR u.hospital_role = 'hospital_admin'))
       ORDER BY (h.user_id = u.id) DESC LIMIT 1`,
      [userId]
    );
    return result.rows[0]?.id ?? null;
  }

  async function encodeAndStore(buffer, preferredKey = crypto.randomUUID()) {
    const key = preferredKey;
    const fullPath = path.join(storageRoot, `${key}.webp`);
    const thumbnailPath = path.join(storageRoot, `${key}-thumb.webp`);
    await fileSystem.mkdir(storageRoot, { recursive: true });
    const image = imageProcessor(buffer, { limitInputPixels: 40_000_000, failOn: 'error' });
    let info;
    try { info = await image.metadata(); }
    catch (error) { error.status = 400; error.message = 'The uploaded file is not a supported image.'; throw error; }
    if (!['jpeg', 'png', 'webp'].includes(info.format) || !info.width || !info.height) {
      const error = new Error('Upload a valid JPEG, PNG, or WebP image.');
      error.status = 400;
      throw error;
    }
    try {
      await imageProcessor(buffer, { limitInputPixels: 40_000_000, failOn: 'error' })
        .rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 84 }).toFile(fullPath);
      await imageProcessor(buffer, { limitInputPixels: 40_000_000, failOn: 'error' })
        .rotate().resize({ width: 480, height: 360, fit: 'cover', withoutEnlargement: true })
        .webp({ quality: 76 }).toFile(thumbnailPath);
    } catch (error) {
      await fileSystem.unlink(fullPath).catch(() => {});
      await fileSystem.unlink(thumbnailPath).catch(() => {});
      if (!error.code || error.code === 'ERR_INPUT_BUFFER' || error.code === 'ERR_IMAGE_FORMAT') {
        error.status = 400;
        error.message = 'The uploaded file is not a supported image.';
      }
      throw error;
    }
    return { key, fullPath, thumbnailPath };
  }

  async function removeStored(key) {
    await Promise.all([
      fileSystem.unlink(path.join(storageRoot, `${key}.webp`)).catch((error) => { if (error.code !== 'ENOENT') throw error; }),
      fileSystem.unlink(path.join(storageRoot, `${key}-thumb.webp`)).catch((error) => { if (error.code !== 'ENOENT') throw error; }),
    ]);
  }

  return {
    async getPublicPhotos(req, res) {
      const hospitalId = parseId(req.params.hospitalId);
      if (!hospitalId) return sendError(res, 400, 'Valid hospital ID is required.');
      const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 24));
      const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);
      try {
        const result = await database.query(
          `SELECT p.id, p.hospital_id, p.caption, p.category, p.display_order, p.is_cover
           FROM hospital_photos p JOIN hospitals h ON h.id = p.hospital_id
           WHERE p.hospital_id = $1 AND p.is_published = TRUE
             AND (h.is_verified = TRUE OR h.directory_visible = TRUE)
           ORDER BY p.is_cover DESC, (p.category = 'entrance') DESC, p.display_order, p.id
           LIMIT $2 OFFSET $3`, [hospitalId, limit + 1, offset]
        );
        const hasMore = result.rows.length > limit;
        return res.json({ success: true, data: result.rows.slice(0, limit).map(metadata), limit, offset, has_more: hasMore });
      } catch (error) {
        console.error('List public hospital photos failed:', error.message);
        return sendError(res, 500, 'Unable to load hospital photos.');
      }
    },

    async getManagedPhotos(req, res) {
      try {
        const hospitalId = await resolveHospital(req.user.id);
        if (!hospitalId) return sendError(res, 403, 'No hospital is assigned to this account.');
        const result = await database.query(
          `SELECT id, hospital_id, caption, category, display_order, is_cover, is_published, created_at, updated_at
           FROM hospital_photos WHERE hospital_id = $1 ORDER BY display_order, id LIMIT $2`,
          [hospitalId, MAX_PHOTOS]
        );
        return res.json({ success: true, data: result.rows.map(metadata), max_photos: MAX_PHOTOS });
      } catch (error) {
        console.error('List managed hospital photos failed:', error.message);
        return sendError(res, 500, 'Unable to load hospital photos.');
      }
    },

    async upload(req, res) {
      const file = req.file;
      if (!file?.buffer) return sendError(res, 400, 'Choose an image to upload.');
      if (file.buffer.length > 8 * 1024 * 1024) return sendError(res, 413, 'Image must be 8 MB or smaller.');
      const input = validateMetadata(req.body || {}, { allowPublication: false });
      if (input.error) return sendError(res, 400, input.error);
      let stored;
      try {
        const hospitalId = await resolveHospital(req.user.id);
        if (!hospitalId) return sendError(res, 403, 'No hospital is assigned to this account.');
        const count = await database.query('SELECT COUNT(*)::int AS count FROM hospital_photos WHERE hospital_id = $1', [hospitalId]);
        if (count.rows[0].count >= MAX_PHOTOS) return sendError(res, 409, 'This hospital has reached the 100-photo gallery limit.');
        stored = await encodeAndStore(file.buffer);
        const result = await database.query(
          `INSERT INTO hospital_photos (hospital_id, storage_key, caption, category, display_order, uploaded_by_user_id)
           VALUES ($1, $2, $3, $4, COALESCE($5, (SELECT COALESCE(MAX(display_order), -1) + 1 FROM hospital_photos WHERE hospital_id = $1)), $6)
           RETURNING id, hospital_id, caption, category, display_order, is_cover, is_published, created_at, updated_at`,
          [hospitalId, stored.key, input.values.caption || '', input.values.category || 'other', input.values.display_order ?? null, req.user.id]
        );
        return res.status(201).json({ success: true, data: metadata(result.rows[0]) });
      } catch (error) {
        if (stored) await removeStored(stored.key).catch(() => {});
        if (error.status === 400) return sendError(res, 400, error.message);
        console.error('Upload hospital photo failed:', error.message);
        return sendError(res, 500, 'Unable to store hospital photo.');
      }
    },

    async updatePhoto(req, res) {
      const photoId = parseId(req.params.photoId);
      if (!photoId) return sendError(res, 400, 'Valid photo ID is required.');
      const input = validateMetadata(req.body || {});
      if (input.error) return sendError(res, 400, input.error);
      const entries = Object.entries(input.values);
      if (!entries.length) return sendError(res, 400, 'No photo changes were provided.');
      const client = await database.connect();
      try {
        const hospitalId = await resolveHospital(req.user.id);
        if (!hospitalId) return sendError(res, 403, 'No hospital is assigned to this account.');
        await client.query('BEGIN');
        const existing = await client.query('SELECT id FROM hospital_photos WHERE id = $1 AND hospital_id = $2 FOR UPDATE', [photoId, hospitalId]);
        if (!existing.rowCount) { await client.query('ROLLBACK'); return sendError(res, 404, 'Photo not found.'); }
        const values = { ...input.values };
        if (values.is_cover === true) {
          await client.query('UPDATE hospital_photos SET is_cover = FALSE, updated_at = CURRENT_TIMESTAMP WHERE hospital_id = $1 AND id <> $2 AND is_cover = TRUE', [hospitalId, photoId]);
          values.is_published = true;
        }
        if (values.is_published === false) values.is_cover = false;
        const updates = Object.entries(values);
        const set = updates.map(([field], i) => `${field} = $${i + 3}`).join(', ');
        const result = await client.query(
          `UPDATE hospital_photos SET ${set}, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND hospital_id = $2
           RETURNING id, hospital_id, caption, category, display_order, is_cover, is_published, created_at, updated_at`,
          [photoId, hospitalId, ...updates.map(([, value]) => value)]
        );
        await client.query('COMMIT');
        return res.json({ success: true, data: metadata(result.rows[0]) });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Update hospital photo failed:', error.message);
        return sendError(res, 500, 'Unable to update hospital photo.');
      } finally { client.release(); }
    },

    async replaceImage(req, res) {
      const photoId = parseId(req.params.photoId);
      if (!photoId || !req.file?.buffer) return sendError(res, 400, 'A valid photo and replacement image are required.');
      if (req.file.buffer.length > 8 * 1024 * 1024) return sendError(res, 413, 'Image must be 8 MB or smaller.');
      let stored;
      try {
        const hospitalId = await resolveHospital(req.user.id);
        if (!hospitalId) return sendError(res, 403, 'No hospital is assigned to this account.');
        const existing = await database.query('SELECT storage_key FROM hospital_photos WHERE id = $1 AND hospital_id = $2', [photoId, hospitalId]);
        if (!existing.rowCount) return sendError(res, 404, 'Photo not found.');
        stored = await encodeAndStore(req.file.buffer);
        const result = await database.query(
          `UPDATE hospital_photos SET storage_key = $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 AND hospital_id = $3
           RETURNING id, hospital_id, caption, category, display_order, is_cover, is_published, created_at, updated_at`,
          [stored.key, photoId, hospitalId]
        );
        await removeStored(existing.rows[0].storage_key).catch((error) => console.error('Unable to remove replaced private image:', error.message));
        return res.json({ success: true, data: metadata(result.rows[0]) });
      } catch (error) {
        if (stored) await removeStored(stored.key).catch(() => {});
        if (error.status === 400) return sendError(res, 400, error.message);
        console.error('Replace hospital photo failed:', error.message);
        return sendError(res, 500, 'Unable to replace hospital photo.');
      }
    },

    async reorder(req, res) {
      const ids = req.body?.photo_ids;
      if (!Array.isArray(ids) || ids.length > MAX_PHOTOS || ids.some((id) => !parseId(id)) || new Set(ids.map(Number)).size !== ids.length) {
        return sendError(res, 400, 'Provide a unique ordered list of valid photo IDs.');
      }
      const client = await database.connect();
      try {
        const hospitalId = await resolveHospital(req.user.id);
        if (!hospitalId) return sendError(res, 403, 'No hospital is assigned to this account.');
        await client.query('BEGIN');
        const rows = await client.query('SELECT id FROM hospital_photos WHERE hospital_id = $1 AND id = ANY($2::int[]) FOR UPDATE', [hospitalId, ids.map(Number)]);
        if (rows.rowCount !== ids.length) { await client.query('ROLLBACK'); return sendError(res, 404, 'One or more photos do not belong to this hospital.'); }
        for (let index = 0; index < ids.length; index += 1) {
          await client.query('UPDATE hospital_photos SET display_order = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND hospital_id = $3', [index, Number(ids[index]), hospitalId]);
        }
        await client.query('COMMIT');
        return res.json({ success: true, message: 'Photo order updated.' });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Reorder hospital photos failed:', error.message);
        return sendError(res, 500, 'Unable to reorder hospital photos.');
      } finally { client.release(); }
    },

    async deletePhoto(req, res) {
      const photoId = parseId(req.params.photoId);
      if (!photoId) return sendError(res, 400, 'Valid photo ID is required.');
      const client = await database.connect();
      let staged = [];
      try {
        const hospitalId = await resolveHospital(req.user.id);
        if (!hospitalId) return sendError(res, 403, 'No hospital is assigned to this account.');
        await client.query('BEGIN');
        const existing = await client.query('SELECT storage_key FROM hospital_photos WHERE id = $1 AND hospital_id = $2 FOR UPDATE', [photoId, hospitalId]);
        if (!existing.rowCount) { await client.query('ROLLBACK'); return sendError(res, 404, 'Photo not found.'); }
        const key = existing.rows[0].storage_key;
        for (const suffix of ['.webp', '-thumb.webp']) {
          const source = path.join(storageRoot, `${key}${suffix}`);
          const temporary = path.join(storageRoot, `${key}${suffix}.deleting`);
          try { await fileSystem.rename(source, temporary); staged.push([source, temporary]); }
          catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
        await client.query('DELETE FROM hospital_photos WHERE id = $1 AND hospital_id = $2', [photoId, hospitalId]);
        await client.query('COMMIT');
        await Promise.all(staged.map(([, temporary]) => fileSystem.unlink(temporary).catch((error) => console.error('Unable to remove staged hospital image:', error.message))));
        return res.json({ success: true, message: 'Photo deleted.' });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        await Promise.all(staged.map(([source, temporary]) => fileSystem.rename(temporary, source).catch(() => {})));
        console.error('Delete hospital photo failed:', error.message);
        return sendError(res, 500, 'Unable to delete hospital photo.');
      } finally { client.release(); }
    },

    async serveImage(req, res) {
      const hospitalId = parseId(req.params.hospitalId);
      const photoId = parseId(req.params.photoId);
      if (!hospitalId || !photoId) return sendError(res, 404, 'Photo not found.');
      try {
        const result = await database.query(
          `SELECT p.storage_key FROM hospital_photos p JOIN hospitals h ON h.id = p.hospital_id
           WHERE p.id = $1 AND p.hospital_id = $2 AND p.is_published = TRUE
             AND (h.is_verified = TRUE OR h.directory_visible = TRUE)`, [photoId, hospitalId]
        );
        if (!result.rowCount) return sendError(res, 404, 'Photo not found.');
        const key = result.rows[0].storage_key;
        if (!/^[a-f0-9-]{36}$/i.test(key)) return sendError(res, 404, 'Photo not found.');
        const suffix = req.query.size === 'thumbnail' ? '-thumb.webp' : '.webp';
        const file = path.join(storageRoot, `${key}${suffix}`);
        await fileSystem.access(file);
        res.set({ 'Content-Type': 'image/webp', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=300' });
        return res.sendFile(file);
      } catch (error) {
        if (error.code === 'ENOENT') return sendError(res, 404, 'Photo image is unavailable.');
        console.error('Serve hospital photo failed:', error.message);
        return sendError(res, 500, 'Unable to load hospital photo.');
      }
    },

    async serveManagedImage(req, res) {
      const photoId = parseId(req.params.photoId);
      if (!photoId) return sendError(res, 404, 'Photo not found.');
      try {
        const hospitalId = await resolveHospital(req.user.id);
        if (!hospitalId) return sendError(res, 403, 'No hospital is assigned to this account.');
        const result = await database.query(
          'SELECT storage_key FROM hospital_photos WHERE id = $1 AND hospital_id = $2',
          [photoId, hospitalId]
        );
        if (!result.rowCount) return sendError(res, 404, 'Photo not found.');
        const key = result.rows[0].storage_key;
        if (!/^[a-f0-9-]{36}$/i.test(key)) return sendError(res, 404, 'Photo not found.');
        const suffix = req.query.size === 'thumbnail' ? '-thumb.webp' : '.webp';
        const file = path.join(storageRoot, `${key}${suffix}`);
        await fileSystem.access(file);
        res.set({ 'Content-Type': 'image/webp', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=300' });
        return res.sendFile(file);
      } catch (error) {
        if (error.code === 'ENOENT') return sendError(res, 404, 'Photo image is unavailable.');
        console.error('Serve managed hospital photo failed:', error.message);
        return sendError(res, 500, 'Unable to load hospital photo.');
      }
    },
  };
}

module.exports = { CATEGORIES, MAX_PHOTOS, STORAGE_ROOT, createHospitalGalleryController };

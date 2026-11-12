const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { createHospitalGalleryController } = require('../src/controllers/hospitalGalleryController');

function response() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    set(headers) { Object.assign(this.headers, headers); return this; },
    sendFile(file) { this.sentFile = file; return this; },
  };
}

function user(id = 7) { return { id }; }

test('new uploads decode image bytes, re-encode privately, and remain unpublished', async (t) => {
  const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'caresync-gallery-'));
  t.after(() => fs.rm(storageRoot, { recursive: true, force: true }));
  const png = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#158f99' } }).png().toBuffer();
  const inserted = { id: 41, hospital_id: 3, caption: 'Front entrance', category: 'entrance', display_order: 0, is_cover: false, is_published: false };
  const db = {
    async query(sql) {
      if (sql.includes('SELECT h.id FROM hospitals')) return { rows: [{ id: 3 }], rowCount: 1 };
      if (sql.includes('SELECT COUNT(*)')) return { rows: [{ count: 0 }], rowCount: 1 };
      if (sql.includes('INSERT INTO hospital_photos')) return { rows: [inserted], rowCount: 1 };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const controller = createHospitalGalleryController({ database: db, storageRoot });
  const res = response();
  await controller.upload({ user: user(), body: { caption: ' Front entrance ', category: 'entrance', is_published: true }, file: { buffer: png, mimetype: 'text/plain', originalname: '../../spoof.png' } }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.is_published, false);
  assert.match(res.body.data.image_url, /\/api\/hospitals\/3\/photos\/41\/image$/);
  const names = await fs.readdir(storageRoot);
  assert.equal(names.length, 2);
  assert.ok(names.every((name) => /^[a-f0-9-]{36}(?:-thumb)?\.webp$/i.test(name)));
});

test('invalid image bytes and oversized upload buffers are rejected', async (t) => {
  const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'caresync-gallery-invalid-'));
  t.after(() => fs.rm(storageRoot, { recursive: true, force: true }));
  const db = { async query(sql) {
    if (sql.includes('SELECT h.id FROM hospitals')) return { rows: [{ id: 3 }], rowCount: 1 };
    if (sql.includes('SELECT COUNT(*)')) return { rows: [{ count: 0 }], rowCount: 1 };
    throw new Error('Unexpected DB access');
  } };
  const controller = createHospitalGalleryController({ database: db, storageRoot });
  const invalid = response();
  await controller.upload({ user: user(), body: {}, file: { buffer: Buffer.from('not an image'), mimetype: 'image/png' } }, invalid);
  assert.equal(invalid.statusCode, 400);

  const large = response();
  await controller.upload({ user: user(), body: {}, file: { buffer: Buffer.alloc(8 * 1024 * 1024 + 1) } }, large);
  assert.equal(large.statusCode, 413);
});

test('accounts without an authorized hospital cannot upload photos', async () => {
  const db = { async query() { return { rows: [], rowCount: 0 }; } };
  const controller = createHospitalGalleryController({ database: db });
  const res = response();
  await controller.upload({ user: user(), body: {}, file: { buffer: Buffer.from('ignored') } }, res);
  assert.equal(res.statusCode, 403);
});

test('patient gallery queries are limited to published photos at listed hospitals', async () => {
  let sqlSeen = '';
  const db = { async query(sql) { sqlSeen = sql; return { rows: [{ id: 2, hospital_id: 5, caption: 'Ward', is_cover: false }], rowCount: 1 }; } };
  const controller = createHospitalGalleryController({ database: db });
  const res = response();
  await controller.getPublicPhotos({ params: { hospitalId: '5' }, query: {} }, res);
  assert.match(sqlSeen, /p\.is_published = TRUE/);
  assert.match(sqlSeen, /h\.is_verified = TRUE OR h\.directory_visible = TRUE/);
  assert.equal(res.body.data[0].image_url, '/api/hospitals/5/photos/2/image');
});

test('unpublished or cross-hospital images are not served to patients', async () => {
  const db = { async query() { return { rows: [], rowCount: 0 }; } };
  const controller = createHospitalGalleryController({ database: db });
  const res = response();
  await controller.serveImage({ params: { hospitalId: '5', photoId: '2' }, query: {} }, res);
  assert.equal(res.statusCode, 404);
});

test('cross-hospital metadata updates are denied', async () => {
  const client = {
    async query(sql) {
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rowCount: 0, rows: [] };
      if (sql.includes('SELECT id FROM hospital_photos')) return { rowCount: 0, rows: [] };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release() {},
  };
  const db = {
    async query(sql) { if (sql.includes('SELECT h.id FROM hospitals')) return { rows: [{ id: 3 }], rowCount: 1 }; throw new Error(`Unexpected SQL: ${sql}`); },
    async connect() { return client; },
  };
  const controller = createHospitalGalleryController({ database: db });
  const res = response();
  await controller.updatePhoto({ user: user(), params: { photoId: '99' }, body: { caption: 'Change' } }, res);
  assert.equal(res.statusCode, 404);
});

test('selecting a published cover atomically clears the previous cover', async () => {
  let clearedCover = false;
  const client = {
    async query(sql) {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rowCount: 0, rows: [] };
      if (sql.includes('SELECT id FROM hospital_photos')) return { rowCount: 1, rows: [{ id: 9 }] };
      if (sql.includes('SET is_cover = FALSE')) { clearedCover = true; return { rowCount: 1, rows: [] }; }
      if (sql.includes('RETURNING id, hospital_id')) return { rowCount: 1, rows: [{ id: 9, hospital_id: 3, is_cover: true, is_published: true }] };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release() {},
  };
  const db = {
    async query(sql) { if (sql.includes('SELECT h.id FROM hospitals')) return { rows: [{ id: 3 }], rowCount: 1 }; throw new Error(`Unexpected SQL: ${sql}`); },
    async connect() { return client; },
  };
  const controller = createHospitalGalleryController({ database: db });
  const res = response();
  await controller.updatePhoto({ user: user(), params: { photoId: '9' }, body: { is_cover: true } }, res);
  assert.equal(clearedCover, true);
  assert.equal(res.body.data.is_published, true);
});

test('hospital staff can update caption and category for their own photo', async () => {
  let updateSql = '';
  const client = {
    async query(sql, params) {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rowCount: 0, rows: [] };
      if (sql.includes('SELECT id FROM hospital_photos')) return { rowCount: 1, rows: [{ id: 4 }] };
      if (sql.includes('RETURNING id, hospital_id')) { updateSql = `${sql} ${JSON.stringify(params)}`; return { rowCount: 1, rows: [{ id: 4, hospital_id: 3, caption: 'Main entrance', category: 'entrance' }] }; }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release() {},
  };
  const db = {
    async query(sql) { if (sql.includes('SELECT h.id FROM hospitals')) return { rows: [{ id: 3 }], rowCount: 1 }; throw new Error(`Unexpected SQL: ${sql}`); },
    async connect() { return client; },
  };
  const res = response();
  await createHospitalGalleryController({ database: db }).updatePhoto({ user: user(), params: { photoId: '4' }, body: { caption: ' Main entrance ', category: 'entrance' } }, res);
  assert.equal(res.statusCode, 200);
  assert.match(updateSql, /caption = \$3, category = \$4/);
  assert.match(updateSql, /"Main entrance"/);
});

test('deleting a hospital photo removes its database record and private image files', async (t) => {
  const storageRoot = await fs.mkdtemp(path.join(__dirname, '.tmp-gallery-delete-'));
  t.after(() => fs.rm(storageRoot, { recursive: true, force: true }));
  const key = '11111111-2222-4333-8444-555555555555';
  await fs.writeFile(path.join(storageRoot, `${key}.webp`), 'full');
  await fs.writeFile(path.join(storageRoot, `${key}-thumb.webp`), 'thumb');
  const client = {
    async query(sql) {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql.includes('DELETE FROM hospital_photos')) return { rowCount: 1, rows: [] };
      if (sql.includes('SELECT storage_key')) return { rowCount: 1, rows: [{ storage_key: key }] };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release() {},
  };
  const db = {
    async query(sql) { if (sql.includes('SELECT h.id FROM hospitals')) return { rows: [{ id: 3 }], rowCount: 1 }; throw new Error(`Unexpected SQL: ${sql}`); },
    async connect() { return client; },
  };
  const res = response();
  await createHospitalGalleryController({ database: db, storageRoot }).deletePhoto({ user: user(), params: { photoId: '4' } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(await fs.readdir(storageRoot), []);
});

test('database insertion failure removes newly encoded files', async (t) => {
  const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'caresync-gallery-rollback-'));
  t.after(() => fs.rm(storageRoot, { recursive: true, force: true }));
  const png = await sharp({ create: { width: 5, height: 5, channels: 3, background: '#158f99' } }).png().toBuffer();
  const db = {
    async query(sql) {
      if (sql.includes('SELECT h.id FROM hospitals')) return { rows: [{ id: 3 }], rowCount: 1 };
      if (sql.includes('SELECT COUNT(*)')) return { rows: [{ count: 0 }], rowCount: 1 };
      if (sql.includes('INSERT INTO hospital_photos')) throw new Error('database unavailable');
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const res = response();
  await createHospitalGalleryController({ database: db, storageRoot }).upload({ user: user(), body: {}, file: { buffer: png } }, res);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(await fs.readdir(storageRoot), []);
});

test('hospital gallery upload routes put authentication before parsing and handling files', () => {
  const router = require('../src/routes/hospitalRoutes');
  const uploadRoute = router.stack.find((layer) => layer.route?.path === '/gallery/photos' && layer.route.methods.post);
  assert.ok(uploadRoute);
  assert.ok(uploadRoute.route.stack.length >= 4);
  assert.equal(uploadRoute.route.stack[0].name, 'protect');
});

test('storage failures return a controlled server error and do not create a photo row', async () => {
  const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#fff' } }).png().toBuffer();
  const db = {
    async query(sql) {
      if (sql.includes('SELECT h.id FROM hospitals')) return { rows: [{ id: 3 }], rowCount: 1 };
      if (sql.includes('SELECT COUNT(*)')) return { rows: [{ count: 0 }], rowCount: 1 };
      throw new Error('The insert must not run when image storage fails');
    },
  };
  const fileSystem = { async mkdir() { const error = new Error('disk full'); error.code = 'ENOSPC'; throw error; } };
  const controller = createHospitalGalleryController({ database: db, fileSystem });
  const res = response();
  await controller.upload({ user: user(), body: {}, file: { buffer: png } }, res);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.success, false);
});

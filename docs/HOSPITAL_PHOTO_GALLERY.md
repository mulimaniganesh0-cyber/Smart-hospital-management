# CareSync hospital photo gallery

## Database setup

The gallery schema is additive in `backend/src/migrations/019_hospital_photo_gallery.sql`.
From `backend/`, first inspect the connection target without applying it:

```powershell
npm run migrate:hospital-gallery
```

After confirming the printed database and server are the intended development target, apply only migration 019:

```powershell
npm run migrate:hospital-gallery -- --apply
```

This dedicated command avoids replaying the repository's older untracked/unversioned SQL files with the generic migration runner. Migration 019 uses repeat-safe table/index creation and adds a partial unique index so a hospital can have at most one published cover photo.

## Local image storage

The backend accepts JPEG, PNG, and WebP uploads up to 8 MB. It decodes and re-encodes accepted images as WebP, limits decoded image dimensions, and generates a smaller thumbnail. It assigns random storage keys; client filenames and MIME types are not used to choose paths or validate content.

By default, private files are kept under `backend/private_uploads/hospital-gallery/`, which is ignored by Git. Set `HOSPITAL_GALLERY_STORAGE_DIR` to another private writable directory when needed. The directory is not mounted as Express static content. Image requests go through an endpoint that checks the database publication state before returning bytes.

This storage is for local development and single-instance evaluation. Production deployments should replace the local filesystem adapter with private object storage (for example, an S3-compatible bucket), use server-generated object keys, keep the bucket private, and issue short-lived authorized URLs or proxy image delivery through the publication check. Do not make the upload directory public or commit hospital photos.

## Hospital staff workflow

Open Hospital Portal → Gallery. Choose up to 10 photos per batch, preview them, set a facility category and optional caption, then upload. Each uploaded photo is an unpublished draft. Staff can replace an image, edit its caption/category, reorder it, publish/unpublish it, select a cover, or delete it. Selecting a cover publishes it and atomically clears the prior cover; unpublishing the cover clears its cover flag. The backend scopes all management operations to the signed-in hospital owner or an account explicitly assigned the `hospital_admin` role for that hospital.

Use hospital-approved, consented images. Do not publish identifiable patients, medical records, screens, or other sensitive material without appropriate authorization.

## Patient experience and API

Patient search results include a published cover thumbnail when one exists. Hospital details show a responsive gallery, captions/categories, a swipeable full-size viewer, zoom, empty state, image placeholders, and bounded pagination. Existing resources, doctors, booking, and directions remain available alongside photos.

- Public: `GET /api/hospitals/:hospitalId/photos?limit=24&offset=0`
- Public published image: `GET /api/hospitals/:hospitalId/photos/:photoId/image` (append `?size=thumbnail` for the thumbnail)
- Hospital management list: `GET /api/hospitals/gallery/manage`
- Upload draft: `POST /api/hospitals/gallery/photos` as multipart field `photo`, plus optional `caption` and `category`
- Replace image: `PUT /api/hospitals/gallery/photos/:photoId/image` as multipart field `photo`
- Edit/publish/cover: `PUT /api/hospitals/gallery/photos/:photoId`
- Reorder: `PUT /api/hospitals/gallery/photos/reorder` with `{ "photo_ids": [1, 2] }`
- Delete: `DELETE /api/hospitals/gallery/photos/:photoId`

All management endpoints require a valid hospital or hospital-admin session. Public list and image responses contain only published photos from a hospital visible in the public directory. PostgreSQL was unavailable during implementation, so migration application and live database-backed request flows still need to be run in the development environment.

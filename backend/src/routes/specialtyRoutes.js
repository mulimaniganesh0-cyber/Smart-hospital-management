const express = require('express');
const { getSpecialties } = require('../controllers/specialtyController');
const router = express.Router();
router.get('/', getSpecialties);
module.exports = router;

const express = require('express');
const router = express.Router();
const doctorController = require('../controllers/doctorController');

router.get('/', doctorController.listDoctors);
router.get('/:id', doctorController.getDoctor);

module.exports = router;

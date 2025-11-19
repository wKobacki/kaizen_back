const express = require('express');
const {resetPassword} = require('../controllers/passwordResetController');
const router = express.Router();

router.post('/', resetPassword);

module.exports = router;
const express = require('express');
const { handlePasswordReset, restorePassword } = require('../controllers/passwordResetController');
const router = express.Router();

router.post('/request-restore', handlePasswordReset);

router.post('/confirm', restorePassword);

module.exports = router;
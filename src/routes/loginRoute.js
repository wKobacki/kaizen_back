const experss = require('express');
const router = experss.Router();
const handleLogin = require('../controllers/loginController');

router.post('/', handleLogin);

module.exports = router;
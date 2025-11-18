const experss = require('express');
const router = experss.Router();
const refreshController = require('../controllers/refreshController');

router.post('/', refreshController.handleRefresh);

module.exports = router;
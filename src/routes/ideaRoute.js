const express = require('express');
const router = express.Router();
const ideaController = require('../controllers/ideaController');
const verifyJWT = require('../middleware/verifyJWT');

router.use(verifyJWT);

router.route('/')
    .post(ideaController.createIdea)

module.exports = router;
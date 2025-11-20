const express = require('express');
const router = express.Router();
const ideaController = require('../controllers/ideaController');
const verifyJWT = require('../middleware/verifyJWT');
const verifyAdmin = require('../middleware/verifyAdmin');

router.use(verifyJWT);


router.route('/')
    .post(ideaController.createIdea)
    .get(ideaController.getUserIdeas);

router.route('/:id')
    .get(ideaController.getIdeaDetails);

router.route('/admin')
    .get(verifyAdmin, ideaController.allIdeas);

module.exports = router;
const express = require('express');
const router = express.Router();
const ideaController = require('../controllers/ideaController');
const verifyJWT = require('../middleware/verifyJWT');

router.use(verifyJWT);

router.get('/', ideaController.getAllIdeas);
router.get('/:id', ideaController.getIdeaDetails);
router.post('/', ideaController.createIdea);

module.exports = router;

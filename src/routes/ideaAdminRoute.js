const express = require('express');
const router = express.Router();
const ideaController = require('../controllers/ideaAdminController');
const verifyJWT = require('../middleware/verifyJWT');
const {verifyAdmin} = require('../middleware/verifyCredentials');

router.use(verifyJWT);
//router.use(verifyAdmin);

router.route('/admin')
    .get(ideaController.getAllIdeas)
    .delete(ideaController.deleteIdea)
    .put(ideaController.editIdeaStatus);

router.route('/admin/:id')
    .get(ideaController.getIdeaDetails);

module.exports = router;
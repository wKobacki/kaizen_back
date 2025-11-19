const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const verifyJWT = require('../middleware/verifyJWT');
const handleNewUser = require('../controllers/registerController');

router.post('/', handleNewUser);

router.use(verifyJWT);

router.route('/:id')
    .get(userController.getUserDetails)
    .put(userController.updateUserRole)
    .put(userController.updateUserBranch)
    .put(userController.updateUserBlockStatus)
    .delete(userController.deleteUser);

module.exports = router;
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const verifyJWT = require('../middleware/verifyJWT');
const {verifyAdmin} = require('../middleware/verifyCredentials');
const handleNewUser = require('../controllers/registerController');

router.post('/', handleNewUser);

router.use(verifyJWT);
router.use(verifyAdmin);

router.route('/admin')
    .get(userController.getUsers);

router.route('/admin/:id')
    .get(userController.getUserDetails)
    .put(userController.updateUserRole)
    .put(userController.updateUserBranch)
    .put(userController.updateUserBlockStatus)
    .put(userController.blockUser)
    .delete(userController.deleteUser);

module.exports = router;
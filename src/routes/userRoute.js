const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const verifyJWT = require('../middleware/verifyJWT');
const {verifyAdmin} = require('../middleware/verifyCredentials');
const handleNewUser = require('../controllers/registerController');

router.post('/', handleNewUser);

router.use(verifyJWT);
router.use(verifyAdmin);

router.get("/admin", userController.getUsers);

router.get("/admin/:id", userController.getUserDetails);

router.put("/admin/:id/role", userController.updateUserRole);

router.put("/admin/:id/branch", userController.updateUserBranch);

router.put("/admin/:id/block", userController.updateUserBlockStatus);

router.put("/admin/:id/suspend", userController.blockUser);

router.delete("/admin/:id", userController.deleteUser);

module.exports = router;
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const verifyJWT = require('../middleware/verifyJWT');
const { verifyAdmin, verifyUser } = require('../middleware/verifyCredentials');
const handleNewUser = require('../controllers/registerController');

router.post('/', handleNewUser);

router.get('/managers', verifyJWT, userController.getManagers);
router.get('/branches', verifyJWT, userController.getBranches);
router.get('/locations', verifyJWT, userController.getLocations);

router.use(verifyJWT);

router.get('/admin', verifyAdmin, userController.getUsers);
router.get('/admin/:id', verifyAdmin, userController.getUserDetails);
router.put('/admin/:id/role', verifyAdmin, userController.updateUserRole);
router.put('/admin/:id/location', verifyAdmin, userController.updateUserBranch);
router.delete('/admin/:id', verifyAdmin, userController.deleteUser);

router.get('/:id', verifyUser, userController.getProfileInfo);
router.put('/:id', verifyUser, userController.updateProfileInfo);
router.put('/:id/password', verifyUser, userController.updateCurrentUserPassword);

module.exports = router;

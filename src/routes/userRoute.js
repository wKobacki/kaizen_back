const exporess = require('express');
const router = exporess.Router();
const userController = require('../controllers/userController');
const verifyJWT = require('../middleware/verifyJWT');
const handleNewUser = require('../controllers/registerController');
const verifyUser = require('../middleware/verifyCredentials');
const { get } = require('./refreshRoute');
const { getUserDetails, updateUserDetails, deleteUser } = userController;

router.route('/:id')
    .get(getUserDetails)
    .put(updateUserDetails)
    .delete(deleteUser);

router.route('/')
    .post(handleNewUser);

router.use(verifyJWT);

module.exports = router;

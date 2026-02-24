const express = require("express");
const router = express.Router();

const { handleLogout } = require("../controllers/logoutController");
const verifyJWT = require("../middleware/verifyJWT");

router.post("/", verifyJWT, handleLogout);

module.exports = router;
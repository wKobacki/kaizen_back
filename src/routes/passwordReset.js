const express = require("express");
const router = express.Router();

const { resetPassword } = require("../controllers/passwordResetController");

router.post("/", resetPassword);

module.exports = router;
const express = require("express");
const router = express.Router();

const verifyJWT = require("../middleware/verifyJWT");

const { getMe } = require("../controllers/meController");
const { verifyUser, resendVerification } = require("../controllers/verifyController"); 

router.get("/me", verifyJWT, getMe);
router.post("/verify", verifyJWT, verifyUser);
router.post("/resend-verification", verifyJWT, resendVerification);

module.exports = router;
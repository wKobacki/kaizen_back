const express = require("express");
const router = express.Router();

const { getRoles, getIdeaStatuses } = require("../controllers/constantsController");
const verifyJWT = require("../middleware/verifyJWT");
const requireVerified = require("../middleware/requireVerified");

router.use(verifyJWT);
router.use(requireVerified);

router.get("/roles", getRoles);
router.get("/statuses", getIdeaStatuses);

module.exports = router;
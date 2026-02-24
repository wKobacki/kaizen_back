const express = require("express");
const router = express.Router();

const verifyJWT = require("../middleware/verifyJWT");
const requireVerified = require("../middleware/requireVerified");
const { verifyAdmin } = require("../middleware/verifyCredentials");

const eventLogController = require("../controllers/eventLogController");

router.use(verifyJWT);
router.use(requireVerified);
router.use(verifyAdmin);

router.get("/", eventLogController.getEvents);
router.post("/", eventLogController.createEvent);
router.delete("/", eventLogController.clearEvents);

module.exports = router;
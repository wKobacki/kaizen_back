const express = require("express");
const router = express.Router();

const verifyJWT = require("../middleware/verifyJWT");
const requireVerified = require("../middleware/requireVerified");
const { verifyAdmin } = require("../middleware/verifyCredentials");
const departmentsController = require("../controllers/departmentsController");

router.use(verifyJWT);
router.use(requireVerified);
router.use(verifyAdmin);

router.get("/", departmentsController.getAllDepartments);
router.put("/:id/supervisor", departmentsController.updateDepartmentSupervisor);

module.exports = router;
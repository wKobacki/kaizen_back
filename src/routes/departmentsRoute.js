const express = require("express");
const router = express.Router();

const verifyJWT = require("../middleware/verifyJWT");
const { verifyAdmin } = require("../middleware/verifyCredentials");
const departmentsController = require("../controllers/departmentsController");

router.use(verifyJWT);
router.use(verifyAdmin);

router.get("/", departmentsController.getAllDepartments);
router.put("/:id/supervisor", departmentsController.updateDepartmentSupervisor);

module.exports = router;

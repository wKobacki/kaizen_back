const express = require("express");
const router = express.Router();

const userController = require("../controllers/userController");
const verifyJWT = require("../middleware/verifyJWT");
const requireVerified = require("../middleware/requireVerified");
const { verifyAdmin, verifyUser } = require("../middleware/verifyCredentials");
const handleNewUser = require("../controllers/registerController");

router.post("/", handleNewUser);

router.post("/password-reset", userController.requestPasswordReset);
router.post("/password-reset/verify-code", userController.verifyPasswordResetCode);
router.post("/password-reset/confirm", userController.confirmPasswordReset);

router.get("/managers", verifyJWT, requireVerified, userController.getManagers);
router.get("/branches", userController.getBranches);
router.get("/branchesSupervisor", userController.getBranchesSupervisorPanel);
router.get("/locations", userController.getLocations);

router.use(verifyJWT);
router.use(requireVerified);

router.get("/admin", verifyAdmin, userController.getUsers);
router.get("/admin/:id", verifyAdmin, userController.getUserDetails);

router.put("/admin/:id", verifyAdmin, userController.updateUserAdmin);
router.post("/admin/:id/force-logout", verifyAdmin, userController.forceLogoutUserAdmin);

router.put("/admin/:id/role", verifyAdmin, userController.updateUserRole);
router.put("/admin/:id/location", verifyAdmin, userController.updateUserBranch);
router.delete("/admin/:id", verifyAdmin, userController.deleteUser);

router.get("/:id", verifyUser, userController.getProfileInfo);
router.put("/:id", verifyUser, userController.updateProfileInfo);
router.put("/:id/password", verifyUser, userController.updateCurrentUserPassword);

module.exports = router;
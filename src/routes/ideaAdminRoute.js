const express = require("express");
const router = express.Router();

const verifyJWT = require("../middleware/verifyJWT");
const requireVerified = require("../middleware/requireVerified");
const { verifyAdmin } = require("../middleware/verifyCredentials");

const {
  getAllIdeas,
  getIdeaDetailsAdmin,
  deleteIdea,
  updateIdeaAdmin,
} = require("../controllers/ideasManagmentController");

router.use(verifyJWT);
router.use(requireVerified);
router.use(verifyAdmin);

router.get("/admin/ideas", getAllIdeas);
router.get("/admin/ideas/:idea_id", getIdeaDetailsAdmin);
router.delete("/admin/ideas/:idea_id", deleteIdea);
router.put("/admin/ideas/:idea_id", updateIdeaAdmin);

module.exports = router;
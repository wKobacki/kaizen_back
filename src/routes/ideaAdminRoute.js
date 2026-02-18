const express = require("express");
const router = express.Router();

const {
  getAllIdeas,
  getIdeaDetailsAdmin,
  deleteIdea,
  updateIdeaAdmin
} = require("../controllers/ideasManagmentController");

router.get("/admin/ideas", getAllIdeas);

router.get("/admin/ideas/:idea_id", getIdeaDetailsAdmin);

router.delete("/admin/ideas/:idea_id", deleteIdea);

router.put("/admin/ideas/:idea_id", updateIdeaAdmin);

module.exports = router;
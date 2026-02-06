const express = require("express");
const router = express.Router();

const controller = require("../controllers/ideaController");
const verifyJWT = require("../middleware/verifyJWT");
const uploadIdeas = require("../middleware/uploadIdeas");
const { requireCommissionAccess } = require("../middleware/requireCommissionAccess");

router.use(verifyJWT);

router.get("/", controller.getAllIdeas);
router.post("/", uploadIdeas.array("images", 3), controller.createIdea);

router.post("/:id/supervisor/approve", controller.supervisorApprove);
router.post("/:id/supervisor/reject", controller.supervisorReject);

router.post("/:id/assign-departments", controller.assignDepartments);
router.post("/:id/department/decision", controller.departmentDecision);

router.get("/:id/workflow", controller.getIdeaWorkflow);

router.post("/:id/commission", controller.createCommission);

router.get("/:id/commission/check", controller.checkCommissionExists);

router.get(
  "/:id/commission/members",
  requireCommissionAccess({ allowOwner: true, mode: "read" }),
  controller.getCommissionMembers
);

router.get(
  "/:id/commission/goals",
  requireCommissionAccess({ allowOwner: true, mode: "read" }),
  controller.getCommissionGoals
);

router.post(
  "/:id/commission/goals",
  requireCommissionAccess({ mode: "write" }),
  controller.saveCommissionGoals
);

router.patch(
  "/:id/commission/goals",
  requireCommissionAccess({ mode: "write" }),
  controller.updateCommissionGoalStatus
);

router.put(
  "/:id/commission",
  requireCommissionAccess({ mode: "write" }),
  controller.updateCommissionMembers
);

router.get(
  "/:id/commission/people",
  requireCommissionAccess({ allowOwner: true, mode: "read" }),
  controller.getCommissionPeople
);

router.get(
  "/:id/commission/:commisionId/members/:userId",
  requireCommissionAccess({ allowOwner: true, mode: "read" }),
  controller.getCommissionSpecificMembers
);

router.post("/:id/complete", controller.completeIdea);

router.get("/:id/departments", controller.getIdeaDepartmentsShort);

router.get("/:id/responsibles", controller.getIdeaResponsibles);
router.put("/:id/responsibles", controller.saveIdeaResponsibles);

router.get("/:id", controller.getIdeaDetails);

module.exports = router;

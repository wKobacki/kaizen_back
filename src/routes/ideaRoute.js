const express = require('express');
const router = express.Router();
const controller = require('../controllers/ideaController');
const verifyJWT = require('../middleware/verifyJWT');

router.use(verifyJWT);

router.get('/', controller.getAllIdeas);
router.get('/:id', controller.getIdeaDetails);
router.post('/', controller.createIdea);

router.post('/:id/supervisor/approve', controller.supervisorApprove);
router.post('/:id/supervisor/reject', controller.supervisorReject);

router.post('/:id/assign-departments', controller.assignDepartments);
router.post('/:id/department/decision', controller.departmentDecision);

router.post('/:id/commission', controller.createCommission);
router.post('/:id/complete', controller.completeIdea);

router.get('/:id/workflow', controller.getIdeaWorkflow);
router.get('/:id/departments', controller.getIdeaDepartmentsShort);

module.exports = router;

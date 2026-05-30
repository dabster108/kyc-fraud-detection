const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");

// Admin routes
router.get("/submissions", adminController.getAllSubmissions);
router.get("/submissions/pending", adminController.getPendingSubmissions);
router.get("/submissions/:id", adminController.getSubmissionDetails);
router.post("/submissions/:id/approve", adminController.approveSubmission);
router.post("/submissions/:id/reject", adminController.rejectSubmission);
router.get("/metrics/dashboard", adminController.getDashboardMetrics);
router.get("/audit-logs", adminController.getAuditLogs);

module.exports = router;

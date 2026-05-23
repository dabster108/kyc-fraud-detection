exports.getPendingSubmissions = async (req, res) => {
  try {
    // TODO: Fetch from database
    res.json({
      success: true,
      count: 0,
      submissions: [],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getSubmissionDetails = async (req, res) => {
  try {
    const { id } = req.params;
    res.json({
      success: true,
      submissionId: id,
      details: {
        status: "PENDING_REVIEW",
        riskScore: 65,
        documents: ["document_front.jpg", "selfie.jpg"],
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.approveSubmission = async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    res.json({
      success: true,
      message: "Submission approved",
      submissionId: id,
      reviewedBy: "admin@example.com",
      notes,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.rejectSubmission = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    res.json({
      success: true,
      message: "Submission rejected",
      submissionId: id,
      reason,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getDashboardMetrics = async (req, res) => {
  try {
    res.json({
      success: true,
      metrics: {
        totalSubmissions: 0,
        pendingReviews: 0,
        approved: 0,
        rejected: 0,
        fraudDetected: 0,
        averageRiskScore: 0,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAuditLogs = async (req, res) => {
  try {
    res.json({
      success: true,
      logs: [],
      total: 0,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

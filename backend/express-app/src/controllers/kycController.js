const kycService = require("../services/kycService");

exports.submitKYC = async (req, res) => {
  try {
    const { body, files } = req;

    // Check if files are uploaded
    if (!files.documentFront) {
      return res
        .status(400)
        .json({ error: "Document front image is required" });
    }

    if (!files.selfie) {
      return res.status(400).json({ error: "Selfie image is required" });
    }

    const result = await kycService.processSubmission({
      userData: body,
      documentFront: files.documentFront[0],
      documentBack: files.documentBack ? files.documentBack[0] : null,
      selfie: files.selfie[0],
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.status(201).json({
      success: true,
      submissionId: result.submissionId,
      status: result.status,
      riskScore: result.riskScore,
      message: "KYC submission received",
    });
  } catch (error) {
    console.error("KYC submission error:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getKYCStatus = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const status = await kycService.getSubmissionStatus(submissionId);
    res.json({ success: true, ...status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getUserSubmissions = async (req, res) => {
  try {
    const { userId } = req.params;
    const submissions = await kycService.getUserSubmissions(userId);
    res.json({ success: true, submissions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

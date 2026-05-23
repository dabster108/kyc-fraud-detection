const mlClient = require("./mlClient");
const { v4: uuidv4 } = require("uuid");
const path = require("path");

class KYCService {
  async processSubmission({
    userData,
    documentFront,
    documentBack,
    selfie,
    ipAddress,
    userAgent,
  }) {
    const submissionId = uuidv4();

    console.log(`Processing submission ${submissionId} from IP: ${ipAddress}`);

    let forgeryResult = null;
    let faceMatchResult = null;
    let riskScore = 0;

    // Step 1: Document forgery detection
    if (documentFront) {
      try {
        forgeryResult = await mlClient.detectForgery(
          documentFront.buffer,
          documentFront.filename,
        );
        console.log("Forgery detection:", forgeryResult);
      } catch (error) {
        console.error("Forgery detection failed:", error.message);
      }
    }

    // Step 2: Face matching between selfie and document
    if (selfie && documentFront) {
      try {
        faceMatchResult = await mlClient.matchFaces(
          selfie.buffer,
          documentFront.buffer,
        );
        console.log("Face match result:", faceMatchResult);
      } catch (error) {
        console.error("Face matching failed:", error.message);
      }
    }

    // Step 3: Calculate risk score
    riskScore = this.calculateRiskScore(forgeryResult, faceMatchResult);

    // Step 4: Determine status based on risk score
    let status = "PENDING_REVIEW";
    if (riskScore < 30) {
      status = "APPROVED";
    } else if (riskScore > 70) {
      status = "REJECTED";
    } else {
      status = "PENDING_REVIEW";
    }

    // TODO: Save to database
    // await db.saveSubmission({ submissionId, status, riskScore, ... })

    return {
      submissionId,
      status,
      riskScore,
      forgeryDetected: forgeryResult?.isForged || false,
      faceMatched: faceMatchResult?.isMatch || false,
    };
  }

  calculateRiskScore(forgeryResult, faceMatchResult) {
    let score = 0;

    // Forgery contributes up to 50 points
    if (forgeryResult && forgeryResult.isForged) {
      score += (forgeryResult.confidenceScore || 0.5) * 50;
    }

    // Face mismatch contributes up to 40 points
    if (faceMatchResult && faceMatchResult.isMatch === false) {
      score += 40;
    } else if (faceMatchResult && faceMatchResult.isMatch === true) {
      score -= 10; // Good match reduces risk
    }

    // Ensure score is between 0-100
    return Math.min(Math.max(score, 0), 100);
  }

  async getSubmissionStatus(submissionId) {
    // TODO: Fetch from database
    return {
      submissionId,
      status: "PENDING_REVIEW",
      riskScore: 50,
      createdAt: new Date().toISOString(),
    };
  }

  async getUserSubmissions(userId) {
    // TODO: Fetch from database
    return [];
  }
}

module.exports = new KYCService();

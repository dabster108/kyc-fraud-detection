const axios = require("axios");

class MLClient {
  constructor() {
    this.mlUrl = process.env.ML_SERVICE_URL || "http://localhost:8000";
    this.timeout = 30000; // 30 seconds timeout
  }

  async detectForgery(imageBuffer, filename) {
    try {
      // Create form data
      const FormData = require("form-data");
      const formData = new FormData();
      formData.append("document", imageBuffer, filename);

      const response = await axios.post(
        `${this.mlUrl}/api/v1/detect-forgery`,
        formData,
        {
          headers: formData.getHeaders(),
          timeout: this.timeout,
        },
      );

      return {
        isForged: response.data.is_forged || false,
        confidenceScore: response.data.confidence_score || 0,
        signals: response.data.forgery_signals || [],
      };
    } catch (error) {
      console.error(`ML service error (forgery detection): ${error.message}`);
      // Return default values if ML service is unavailable
      return {
        isForged: false,
        confidenceScore: 0,
        signals: [],
        error: error.message,
      };
    }
  }

  async matchFaces(selfieBuffer, documentBuffer) {
    try {
      const FormData = require("form-data");
      const formData = new FormData();
      formData.append("selfie", selfieBuffer, "selfie.jpg");
      formData.append("document_face", documentBuffer, "document.jpg");

      const response = await axios.post(
        `${this.mlUrl}/api/v1/match-faces`,
        formData,
        {
          headers: formData.getHeaders(),
          timeout: this.timeout,
        },
      );

      return {
        isMatch: response.data.is_match || false,
        confidence: response.data.confidence || 0,
        similarityScore: response.data.similarity_score || 0,
      };
    } catch (error) {
      console.error(`ML service error (face matching): ${error.message}`);
      // Assume match if ML service is unavailable (avoid false positives)
      return {
        isMatch: true,
        confidence: 0.5,
        similarityScore: 0.5,
        error: error.message,
      };
    }
  }

  async analyzeBehavior(sessionData) {
    try {
      const response = await axios.post(
        `${this.mlUrl}/api/v1/analyze-behavior`,
        sessionData,
        { timeout: this.timeout },
      );

      return {
        isSuspicious: response.data.is_suspicious || false,
        anomalyScore: response.data.anomaly_score || 0,
        signals: response.data.signals || [],
      };
    } catch (error) {
      console.error(`ML service error (behavior analysis): ${error.message}`);
      return {
        isSuspicious: false,
        anomalyScore: 0,
        signals: [],
      };
    }
  }
}

module.exports = new MLClient();

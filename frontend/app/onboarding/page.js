"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import FingerprintJS from "@fingerprintjs/fingerprintjs";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from "../components/icons";
import Stepper from "../components/Stepper";
import TopNav from "../components/TopNav";
import FaceVerificationStep from "../components/steps/FaceVerificationStep";
import PersonalInfoStep from "../components/steps/PersonalInfoStep";
import UploadDocumentStep from "../components/steps/UploadDocumentStep";

// Document-first flow: upload the ID first so OCR can pre-fill the review form.
const steps = [
  { id: 1, label: "Upload Document" },
  { id: 2, label: "Review Info" },
  { id: 3, label: "Face Verification" },
];

const documentTypes = ["Passport", "Citizenship", "Driving License"];

const EMPTY_FORM = {
  nationality: "",
  fullName: "",
  dob: "",
  gender: "",
  familySide: "",
  fatherName: "",
  grandfatherName: "",
  motherName: "",
  grandmotherName: "",
  maritalStatus: "",
  currentProvince: "",
  currentDistrict: "",
  currentMunicipality: "",
  currentWard: "",
  currentStreet: "",
  permanentSame: false,
  permanentProvince: "",
  permanentDistrict: "",
  permanentMunicipality: "",
  permanentWard: "",
  permanentStreet: "",
  occupation: "",
  panNumber: "",
  phone: "",
  email: "",
  documentNumber: "",
  documentIssuedDate: "",
  documentIssuedPlace: "",
};

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [documentType, setDocumentType] = useState("Passport");
  const [isDragging, setIsDragging] = useState(false);
  const [docFile, setDocFile] = useState(null);
  const [docPreviewUrl, setDocPreviewUrl] = useState("");
  const [docFrontFile, setDocFrontFile] = useState(null);
  const [docBackFile, setDocBackFile] = useState(null);
  const [docFrontPreviewUrl, setDocFrontPreviewUrl] = useState("");
  const [docBackPreviewUrl, setDocBackPreviewUrl] = useState("");
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [formErrors, setFormErrors] = useState({});
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [faceCaptures, setFaceCaptures] = useState({
    front: null,
    left: null,
    right: null,
  });
  const [recordingStatus, setRecordingStatus] = useState("idle");
  const [faceVideoUrl, setFaceVideoUrl] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [riskFlags, setRiskFlags] = useState({});
  const [ocrData, setOcrData] = useState(null);
  const [ocrPrefilledKeys, setOcrPrefilledKeys] = useState([]);
  const [editComparison, setEditComparison] = useState(null);
  const [forgeryDecision, setForgeryDecision] = useState(null);
  const [forgeryScore, setForgeryScore] = useState(null);
  const [forgeryDetails, setForgeryDetails] = useState(null);
  const [documentUrl, setDocumentUrl] = useState(null);
  const [documentBackUrl, setDocumentBackUrl] = useState(null);
  const [documentFaceUrl, setDocumentFaceUrl] = useState(null);
  const [selfieUrl, setSelfieUrl] = useState(null);
  const [faceIsMatch, setFaceIsMatch] = useState(null);
  const [faceSimilarityScore, setFaceSimilarityScore] = useState(null);
  const [faceVerificationDone, setFaceVerificationDone] = useState(false);
  const [deviceFingerprint, setDeviceFingerprint] = useState(null);
  const pageLoadTimeRef = useRef(Date.now());
  const [isStepLoading, setIsStepLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [isClient, setIsClient] = useState(false);
  const fileInputRef = useRef(null);
  const fileFrontInputRef = useRef(null);
  const fileBackInputRef = useRef(null);
  const dobInputRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const recordTimeoutRef = useRef(null);
  const recordChunksRef = useRef([]);

  const primaryAction = useMemo(() => {
    return {
      label: "Continue",
      icon: <ChevronRightIcon className="h-4 w-4" />,
    };
  }, []);

  useEffect(() => {
    setIsClient(true);
    pageLoadTimeRef.current = Date.now();

    // Load device fingerprint in the background — non-blocking
    FingerprintJS.load()
      .then((fp) => fp.get())
      .then((result) => setDeviceFingerprint(result.visitorId))
      .catch(() => {/* fingerprint unavailable — silent fail */});

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      if (recordTimeoutRef.current) {
        clearTimeout(recordTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const attachStream = async () => {
      if (!cameraStream || !videoRef.current) {
        return;
      }

      try {
        videoRef.current.srcObject = cameraStream;
        setCameraReady(true);
        videoRef.current.onloadedmetadata = () => {
          videoRef.current
            .play()
            .catch(() => {
              setCameraError(true);
              setCameraReady(false);
            });
        };
      } catch (error) {
        setCameraError(true);
        setCameraReady(false);
      }
    };

    attachStream();
  }, [cameraStream]);

  useEffect(() => {
    if (!faceVerificationDone) {
      return;
    }
    if (recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.stop();
    }
  }, [faceVerificationDone]);

  useEffect(() => {
    if (!docFile) {
      setDocPreviewUrl("");
      return;
    }

    const previewUrl = URL.createObjectURL(docFile);
    setDocPreviewUrl(previewUrl);

    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [docFile]);

  useEffect(() => {
    if (!docFrontFile) {
      setDocFrontPreviewUrl("");
      return;
    }

    const previewUrl = URL.createObjectURL(docFrontFile);
    setDocFrontPreviewUrl(previewUrl);

    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [docFrontFile]);

  useEffect(() => {
    if (!docBackFile) {
      setDocBackPreviewUrl("");
      return;
    }

    const previewUrl = URL.createObjectURL(docBackFile);
    setDocBackPreviewUrl(previewUrl);

    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [docBackFile]);

  const validateEmail = (value) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  // Step 1 — document upload only (no metadata fields)
  const validateDocument = () => {
    const errors = {};

    if (documentType === "Citizenship") {
      if (!docFrontFile) {
        errors.documentFront = "Please upload the front of your citizenship.";
      }
      if (!docBackFile) {
        errors.documentBack = "Please upload the back of your citizenship.";
      }
    } else if (!docFile) {
      errors.document = "Please upload a document to continue.";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Step 2 — document details + personal info (OCR-prefilled, user-edited)
  const validatePersonalInfo = () => {
    const errors = {};

    if (!formData.documentNumber.trim()) {
      errors.documentNumber =
        documentType === "Citizenship"
          ? "Citizenship number is required."
          : "Document number is required.";
    }

    if (!formData.documentIssuedDate.trim()) {
      errors.documentIssuedDate = "Issued date is required.";
    }

    if (!formData.documentIssuedPlace.trim()) {
      errors.documentIssuedPlace = "Issued place is required.";
    }

    if (!formData.nationality.trim()) {
      errors.nationality = "Nationality is required.";
    }

    if (!formData.fullName.trim()) {
      errors.fullName = "Full name is required.";
    }

    if (!formData.dob.trim()) {
      errors.dob = "Date of birth is required.";
    }

    if (!formData.gender.trim()) {
      errors.gender = "Gender is required.";
    }

    if (!formData.familySide.trim()) {
      errors.familySide = "Family side is required.";
    }

    if (formData.familySide === "Father's side") {
      if (!formData.fatherName.trim()) {
        errors.fatherName = "Father's / Husband's name is required.";
      }

      if (!formData.grandfatherName.trim()) {
        errors.grandfatherName = "Grandfather's / Father-in-law's name is required.";
      }
    }

    if (formData.familySide === "Mother's side") {
      if (!formData.motherName.trim()) {
        errors.motherName = "Mother's / Wife's name is required.";
      }

      if (!formData.grandmotherName.trim()) {
        errors.grandmotherName = "Grandmother's / Mother-in-law's name is required.";
      }
    }

    if (!formData.maritalStatus.trim()) {
      errors.maritalStatus = "Marital status is required.";
    }

    if (!formData.currentProvince.trim()) {
      errors.currentProvince = "Province is required.";
    }

    if (!formData.currentDistrict.trim()) {
      errors.currentDistrict = "District is required.";
    }

    if (!formData.currentMunicipality.trim()) {
      errors.currentMunicipality = "Municipality/VDC is required.";
    }

    if (!formData.currentWard.trim()) {
      errors.currentWard = "Ward number is required.";
    }

    if (!formData.permanentSame) {
      if (!formData.permanentProvince.trim()) {
        errors.permanentProvince = "Province is required.";
      }
      if (!formData.permanentDistrict.trim()) {
        errors.permanentDistrict = "District is required.";
      }
      if (!formData.permanentMunicipality.trim()) {
        errors.permanentMunicipality = "Municipality/VDC is required.";
      }
      if (!formData.permanentWard.trim()) {
        errors.permanentWard = "Ward number is required.";
      }
    }

    if (!formData.occupation.trim()) {
      errors.occupation = "Occupation is required.";
    }

    if (!formData.phone.trim()) {
      errors.phone = "Phone number is required.";
    } else if (!/^[0-9]{7,15}$/.test(formData.phone.trim())) {
      errors.phone = "Enter a valid phone number.";
    }

    if (formData.email.trim() && !validateEmail(formData.email)) {
      errors.email = "Enter a valid email address.";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const formatTimestamp = (date) => {
    const datePart = date.toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    });
    const timePart = date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return `${datePart} ${timePart}`;
  };

  const finalizeSubmission = async ({
    backendRiskFlags = {},
    backendSelfieUrl = null,
    backendFaceIsMatch = null,
    backendFaceSimilarity = null,
  }) => {
    setSubmitError("");
    setIsStepLoading(true);
    try {
      if (backendRiskFlags && Object.keys(backendRiskFlags).length > 0) {
        setRiskFlags((current) => ({ ...current, ...backendRiskFlags }));
      }
      if (backendSelfieUrl) setSelfieUrl(backendSelfieUrl);
      if (backendFaceIsMatch !== undefined && backendFaceIsMatch !== null) {
        setFaceIsMatch(backendFaceIsMatch);
      }
      if (backendFaceSimilarity != null) {
        setFaceSimilarityScore(backendFaceSimilarity);
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      setCameraReady(false);
      setFaceVerificationDone(true);
      setIsStepLoading(false);
      setIsSubmitted(true);
    } catch (error) {
      setIsStepLoading(false);
      setSubmitError(error?.message || "Unable to complete submission. Please try again.");
      console.error("Onboarding submit failed:", error);
    }
  };

  const handleVerificationComplete = async (result) => {
    if (faceVerificationDone || isStepLoading) {
      return;
    }
    setFaceCaptures(result.captures);
    if (result.selfieUrl) setSelfieUrl(result.selfieUrl);
    if (result.faceIsMatch !== undefined && result.faceIsMatch !== null) {
      setFaceIsMatch(result.faceIsMatch);
    }
    if (result.faceSimilarity != null) {
      setFaceSimilarityScore(result.faceSimilarity);
    }
    if (result.riskFlags && Object.keys(result.riskFlags).length > 0) {
      setRiskFlags((current) => ({ ...current, ...result.riskFlags }));
    }

    await finalizeSubmission({
      backendRiskFlags: result.riskFlags || {},
      backendSelfieUrl: result.selfieUrl,
      backendFaceIsMatch: result.faceIsMatch,
      backendFaceSimilarity: result.faceSimilarity,
    });
  };

  const onNext = async () => {
    // ── STEP 1: Upload document → OCR + forgery, then pre-fill the form ──────
    if (step === 1) {
      if (!validateDocument()) {
        return;
      }

      setIsStepLoading(true);
      setSubmitError("");
      try {
        const fd = new FormData();
        fd.append("documentType", documentType);
        if (deviceFingerprint) fd.append("deviceFingerprint", deviceFingerprint);

        if (documentType === "Citizenship") {
          if (docFrontFile) fd.append("frontImage", docFrontFile);
          if (docBackFile) fd.append("backImage", docBackFile);
        } else if (docFile) {
          fd.append("frontImage", docFile);
        }

        const res = await fetch(
          "http://localhost:5000/api/v1/onboarding/session/document",
          { method: "POST", body: fd }
        );
        const data = await res.json();

        if (!res.ok || !data.success) {
          setSubmitError(data.error || "Could not process document. Please try again.");
          setIsStepLoading(false);
          return;
        }

        setSessionId(data.sessionId);
        setOcrData(data.ocrData || null);
        setForgeryDecision(data.forgeryDecision || null);
        setForgeryScore(data.forgeryScore ?? null);
        setForgeryDetails(data.forgeryDetails || null);
        setDocumentUrl(data.documentUrl || null);
        setDocumentBackUrl(data.documentBackUrl || null);
        setDocumentFaceUrl(data.documentFaceUrl || null);
        setRiskFlags(data.riskFlags || {});

        // Pre-fill the Review step from the OCR-extracted values. We only fill
        // empty fields so we never clobber anything the user already typed.
        const prefill = data.prefill || {};
        const prefillKeys = Object.keys(prefill).filter((k) => prefill[k]);
        if (prefillKeys.length > 0) {
          // If OCR filled both current and permanent address with the same
          // values, check "same as current" so the user doesn't have to fill
          // both sections.
          const sameAddr =
            prefill.currentProvince &&
            prefill.permanentProvince &&
            prefill.currentProvince === prefill.permanentProvince &&
            prefill.currentDistrict === prefill.permanentDistrict;

          setFormData((current) => {
            const next = { ...current };
            for (const key of prefillKeys) {
              if (!next[key]) next[key] = prefill[key];
            }
            if (sameAddr) next.permanentSame = true;
            return next;
          });
          setOcrPrefilledKeys(prefillKeys);
        }
        // Reset the "form fill" timer — Step 2 is the real human-input step.
        pageLoadTimeRef.current = Date.now();
      } catch {
        setSubmitError("Could not reach the server. Please check your connection.");
        setIsStepLoading(false);
        return;
      }
      setIsStepLoading(false);
      setStep(2);
      return;
    }

    // ── STEP 2: Review/edit personal info → tamper check vs OCR baseline ─────
    if (step === 2) {
      if (!validatePersonalInfo()) {
        return;
      }

      setIsStepLoading(true);
      setSubmitError("");
      try {
        const submissionSpeedMs = Date.now() - pageLoadTimeRef.current;
        const sid = sessionId || "unknown";
        const res = await fetch(
          `http://localhost:5000/api/v1/onboarding/session/${sid}/personal-info`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...formData,
              deviceFingerprint: deviceFingerprint || null,
              submissionSpeedMs,
            }),
          }
        );
        const data = await res.json();

        if (!res.ok || !data.success) {
          setSubmitError(data.error || "Could not save your info. Please try again.");
          setIsStepLoading(false);
          return;
        }

        setRiskFlags(data.riskFlags || {});
        setEditComparison(data.editComparison || null);
      } catch {
        setSubmitError("Could not reach the server. Please check your connection.");
        setIsStepLoading(false);
        return;
      }
      setIsStepLoading(false);
      setStep(3);
      return;
    }

  };

  const onBack = () => {
    setStep((current) => Math.max(current - 1, 1));
  };

  const canProceed = useMemo(() => {
    if (isStepLoading) return false;

    if (step === 1) {
      const hasDocumentUploads =
        documentType === "Citizenship"
          ? Boolean(docFrontFile) && Boolean(docBackFile)
          : Boolean(docFile);
      return hasDocumentUploads;
    }

    if (step === 2) {
      return (
        formData.documentNumber.trim() &&
        formData.documentIssuedDate.trim() &&
        formData.documentIssuedPlace.trim() &&
        formData.nationality.trim() &&
        formData.fullName.trim() &&
        formData.dob.trim() &&
        formData.gender.trim() &&
        formData.familySide.trim() &&
        (formData.familySide !== "Father's side" ||
          (formData.fatherName.trim() && formData.grandfatherName.trim())) &&
        (formData.familySide !== "Mother's side" ||
          (formData.motherName.trim() && formData.grandmotherName.trim())) &&
        formData.maritalStatus.trim() &&
        formData.currentProvince.trim() &&
        formData.currentDistrict.trim() &&
        formData.currentMunicipality.trim() &&
        formData.currentWard.trim() &&
        (formData.permanentSame ||
          (formData.permanentProvince.trim() &&
            formData.permanentDistrict.trim() &&
            formData.permanentMunicipality.trim() &&
            formData.permanentWard.trim())) &&
        formData.occupation.trim() &&
        formData.phone.trim() &&
        /^[0-9]{7,15}$/.test(formData.phone.trim()) &&
        (!formData.email.trim() || validateEmail(formData.email))
      );
    }

    if (step === 3) {
      return false;
    }

    return true;
  }, [docFile, docFrontFile, docBackFile, documentType, formData, isStepLoading, step]);

  const handleInputChange = (key) => (event) => {
    const value =
      event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setFormData((current) => ({ ...current, [key]: value }));
    setFormErrors((current) => {
      if (!(key in current)) {
        return current;
      }
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  useEffect(() => {
    if (!formData.permanentSame) {
      return;
    }
    setFormData((current) => ({
      ...current,
      permanentProvince: current.currentProvince,
      permanentDistrict: current.currentDistrict,
      permanentMunicipality: current.currentMunicipality,
      permanentWard: current.currentWard,
      permanentStreet: current.currentStreet,
    }));
  }, [
    formData.permanentSame,
    formData.currentProvince,
    formData.currentDistrict,
    formData.currentMunicipality,
    formData.currentWard,
    formData.currentStreet,
  ]);

  useEffect(() => {
    if (!formData.familySide) {
      return;
    }
    setFormErrors((current) => {
      const next = { ...current };
      if (formData.familySide === "Father's side") {
        delete next.motherName;
        delete next.grandmotherName;
      }
      if (formData.familySide === "Mother's side") {
        delete next.fatherName;
        delete next.grandfatherName;
      }
      return next;
    });
  }, [formData.familySide]);

  const clearDocumentError = (errorKey) => {
    setFormErrors((current) => {
      if (!(errorKey in current)) {
        return current;
      }
      const next = { ...current };
      delete next[errorKey];
      return next;
    });
  };

  const handleFileSelect = (files, target = "single") => {
    if (!files || files.length === 0) {
      return;
    }
    const [file] = files;
    if (target === "front") {
      setDocFrontFile(file);
      clearDocumentError("documentFront");
      return;
    }

    if (target === "back") {
      setDocBackFile(file);
      clearDocumentError("documentBack");
      return;
    }

    setDocFile(file);
    clearDocumentError("document");
  };

  const onDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    handleFileSelect(event.dataTransfer.files);
  };

  const onDragOver = (event) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const openFilePicker = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const openFrontFilePicker = () => {
    if (fileFrontInputRef.current) {
      fileFrontInputRef.current.click();
    }
  };

  const openBackFilePicker = () => {
    if (fileBackInputRef.current) {
      fileBackInputRef.current.click();
    }
  };

  const handleDocumentTypeChange = (type) => {
    setDocumentType(type);
    setDocFile(null);
    setDocFrontFile(null);
    setDocBackFile(null);
    setFormErrors((current) => {
      const next = { ...current };
      delete next.document;
      delete next.documentFront;
      delete next.documentBack;
      return next;
    });
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    if (recordTimeoutRef.current) {
      clearTimeout(recordTimeoutRef.current);
      recordTimeoutRef.current = null;
    }
  };

  const startRecording = (stream) => {
    if (typeof MediaRecorder === "undefined") {
      setRecordingStatus("unavailable");
      return;
    }

    try {
      const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
      recordChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        const blob = new Blob(recordChunksRef.current, { type: "video/webm" });
        setFaceVideoUrl(URL.createObjectURL(blob));
        setRecordingStatus("saved");
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecordingStatus("recording");
      recordTimeoutRef.current = setTimeout(() => {
        stopRecording();
      }, 7000);
    } catch (error) {
      setRecordingStatus("unavailable");
    }
  };

  const startCamera = async () => {
    setCameraError(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(true);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      setCameraStream(stream);
      setCameraReady(true);
      setRecordingStatus("idle");
      setFaceVideoUrl("");
      startRecording(stream);
    } catch (error) {
      setCameraError(true);
      setCameraReady(false);
    }
  };

  const resetFlow = () => {
    setIsSubmitted(false);
    setStep(1);
    setFormData({ ...EMPTY_FORM });
    setFormErrors({});
    setDocumentType("Passport");
    setDocFile(null);
    setDocFrontFile(null);
    setDocBackFile(null);
    setFaceCaptures({ front: null, left: null, right: null });
    setFaceVerificationDone(false);
    setFaceSimilarityScore(null);
    setSessionId(null);
    setOcrData(null);
    setOcrPrefilledKeys([]);
    setEditComparison(null);
    setForgeryDecision(null);
    setForgeryScore(null);
    setForgeryDetails(null);
    setDocumentUrl(null);
    setDocumentFaceUrl(null);
    setSelfieUrl(null);
    setFaceIsMatch(null);
    setRiskFlags({});
    pageLoadTimeRef.current = Date.now();
  };

  // Tamper signals surfaced from the OCR-vs-edit comparison (Step 2 response).
  const editFlags = editComparison?.flags || {};
  const hasDrasticEdit = Boolean(
    editFlags.drastic_ocr_edit ||
      editFlags.edited_name_mismatch ||
      editFlags.edited_dob_mismatch ||
      editFlags.edited_gender_mismatch ||
      editFlags.edited_district_mismatch ||
      editFlags.edited_ward_mismatch ||
      editFlags.edited_father_name_mismatch ||
      editFlags.edited_mother_name_mismatch ||
      editFlags.edited_document_number_mismatch
  );

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <TopNav />

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center px-6 py-12">
        {isSubmitted ? (
          <section className="w-full max-w-3xl rounded-2xl bg-white p-12 text-center shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
              <CheckIcon className="h-7 w-7" />
            </div>
            <h1 className="mt-6 font-display text-3xl text-[#0B1324]">
              KYC submitted successfully
            </h1>
            <p className="mt-3 text-sm text-[#64748B]">
              Please wait for a human to review it.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/admin"
                className="rounded-full bg-[var(--brand)] px-6 py-3 text-sm font-semibold text-white"
              >
                Go to Admin Panel
              </Link>
              <button
                onClick={resetFlow}
                className="rounded-full border border-[#E2E8F0] px-6 py-3 text-sm font-semibold text-[#64748B]"
              >
                Submit another KYC
              </button>
            </div>
          </section>
        ) : (
          <div className="flex w-full max-w-4xl flex-col items-center gap-10">
            <div className="flex w-full justify-center">
              <Stepper steps={steps} currentStep={step} />
            </div>

            <section className="w-full rounded-2xl bg-white p-10 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
              {step === 1 && (
                <UploadDocumentStep
                  documentTypes={documentTypes}
                  documentType={documentType}
                  onSelectType={handleDocumentTypeChange}
                  formErrors={formErrors}
                  isDragging={isDragging}
                  onOpenFilePicker={openFilePicker}
                  onOpenFrontFilePicker={openFrontFilePicker}
                  onOpenBackFilePicker={openBackFilePicker}
                  onDrop={onDrop}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  fileInputRef={fileInputRef}
                  fileFrontInputRef={fileFrontInputRef}
                  fileBackInputRef={fileBackInputRef}
                  onFileChange={(event) => handleFileSelect(event.target.files)}
                  onFrontFileChange={(event) =>
                    handleFileSelect(event.target.files, "front")
                  }
                  onBackFileChange={(event) =>
                    handleFileSelect(event.target.files, "back")
                  }
                  docFile={docFile}
                  previewUrl={docPreviewUrl}
                  docFrontFile={docFrontFile}
                  docBackFile={docBackFile}
                  frontPreviewUrl={docFrontPreviewUrl}
                  backPreviewUrl={docBackPreviewUrl}
                />
              )}

              {step === 2 && (
                <div className="space-y-6">
                  {ocrPrefilledKeys.length > 0 && (
                    <div className="flex items-start gap-3 rounded-xl border border-[rgba(82,196,26,0.3)] bg-[rgba(82,196,26,0.08)] px-4 py-3">
                      <span className="mt-0.5 text-base text-[var(--brand)]">✓</span>
                      <div>
                        <p className="text-sm font-semibold text-[#0F172A]">
                          We pre-filled these fields from your document
                        </p>
                        <p className="mt-0.5 text-xs text-[#64748B]">
                          OCR isn&apos;t always perfect — please review every field and fix
                          anything that looks wrong before continuing.
                        </p>
                      </div>
                    </div>
                  )}

                  {forgeryDecision &&
                    forgeryDecision !== "genuine" &&
                    forgeryDecision !== "unknown" && (
                      <div
                        className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
                          forgeryDecision === "forged"
                            ? "border-red-200 bg-red-50"
                            : "border-amber-200 bg-amber-50"
                        }`}
                      >
                        <span
                          className={`mt-0.5 text-base ${
                            forgeryDecision === "forged" ? "text-red-500" : "text-amber-500"
                          }`}
                        >
                          {forgeryDecision === "forged" ? "⚠" : "⚑"}
                        </span>
                        <div>
                          <p
                            className={`text-sm font-semibold ${
                              forgeryDecision === "forged" ? "text-red-800" : "text-amber-800"
                            }`}
                          >
                            {forgeryDecision === "forged"
                              ? "Document authenticity concern detected"
                              : "Document requires additional review"}
                          </p>
                          <p
                            className={`mt-0.5 text-xs ${
                              forgeryDecision === "forged" ? "text-red-600" : "text-amber-600"
                            }`}
                          >
                            Our system flagged this document. Your application will be
                            reviewed manually by our team.
                          </p>
                        </div>
                      </div>
                    )}

                  <PersonalInfoStep
                    documentType={documentType}
                    formData={formData}
                    formErrors={formErrors}
                    onChange={handleInputChange}
                    dobInputRef={dobInputRef}
                  />
                </div>
              )}

              {step === 3 && (
                <div className="space-y-6">
                  <FaceVerificationStep
                    cameraReady={cameraReady}
                    cameraError={cameraError}
                    videoRef={videoRef}
                    onStartCamera={startCamera}
                    sessionId={sessionId}
                    onVerificationComplete={handleVerificationComplete}
                    onVerificationError={setSubmitError}
                  />
                </div>
              )}
            </section>

            {submitError ? (
              <p className="w-full max-w-4xl rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                {submitError}
              </p>
            ) : null}

            {Object.keys(formErrors).length > 0 ? (() => {
              const FIELD_LABELS = {
                nationality: "Nationality",
                fullName: "Full Name",
                dob: "Date of Birth",
                gender: "Gender",
                familySide: "Family Side",
                fatherName: "Father's / Husband's Name",
                grandfatherName: "Grandfather's / Father-in-law's Name",
                motherName: "Mother's / Wife's Name",
                grandmotherName: "Grandmother's / Mother-in-law's Name",
                maritalStatus: "Marital Status",
                currentProvince: "Current Address — Province",
                currentDistrict: "Current Address — District",
                currentMunicipality: "Current Address — Municipality / VDC",
                currentWard: "Current Address — Ward No.",
                permanentProvince: "Permanent Address — Province",
                permanentDistrict: "Permanent Address — District",
                permanentMunicipality: "Permanent Address — Municipality / VDC",
                permanentWard: "Permanent Address — Ward No.",
                occupation: "Occupation",
                phone: "Phone Number",
                email: "Email Address",
                documentNumber: "Document Number",
                documentIssuedDate: "Issued Date",
                documentIssuedPlace: "Issued Place",
                document: "Document Upload",
                documentFront: "Citizenship Front",
                documentBack: "Citizenship Back",
              };
              const missingFields = Object.entries(formErrors)
                .filter(([, msg]) => msg)
                .map(([key, msg]) => ({ label: FIELD_LABELS[key] || key, msg }));
              return (
                <div className="w-full max-w-4xl rounded-xl border border-red-200 bg-red-50 px-5 py-4">
                  <p className="text-sm font-semibold text-red-700">
                    {missingFields.length === 1
                      ? "1 field needs attention:"
                      : `${missingFields.length} fields need attention:`}
                  </p>
                  <ul className="mt-2 space-y-1">
                    {missingFields.map(({ label, msg }) => (
                      <li key={label} className="flex items-start gap-2 text-xs text-red-600">
                        <span className="mt-0.5 text-red-400">•</span>
                        <span><span className="font-semibold">{label}</span> — {msg}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })() : null}

            {step >= 2 && hasDrasticEdit ? (
              <div className="w-full max-w-4xl rounded-xl border border-amber-300 bg-amber-50 px-5 py-4">
                <p className="text-sm font-semibold text-amber-800">
                  Heads up — some details differ significantly from your document.
                </p>
                <p className="mt-1 text-xs text-amber-700">
                  The values you submitted diverge from what we read on your ID, so this
                  application will get extra manual review.
                </p>
                <ul className="mt-2 space-y-1 text-xs text-amber-700">
                  {editFlags.edited_name_mismatch && (
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5">•</span>
                      <span>Name differs notably from the document.</span>
                    </li>
                  )}
                  {editFlags.edited_dob_mismatch && (
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5">•</span>
                      <span>Date of birth doesn&apos;t match the document.</span>
                    </li>
                  )}
                  {editFlags.edited_gender_mismatch && (
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5">•</span>
                      <span>Gender doesn&apos;t match the document.</span>
                    </li>
                  )}
                  {editFlags.edited_district_mismatch && (
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5">•</span>
                      <span>Permanent district differs from the document.</span>
                    </li>
                  )}
                  {editFlags.edited_ward_mismatch && (
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5">•</span>
                      <span>Ward number differs from the document.</span>
                    </li>
                  )}
                  {editFlags.edited_father_name_mismatch && (
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5">•</span>
                      <span>Father&apos;s name differs notably from the document.</span>
                    </li>
                  )}
                  {editFlags.edited_document_number_mismatch && (
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5">•</span>
                      <span>Document number differs from what was read on your ID.</span>
                    </li>
                  )}
                  {editFlags.edited_mother_name_mismatch && (
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5">•</span>
                      <span>Mother&apos;s name differs notably from the document.</span>
                    </li>
                  )}
                </ul>
              </div>
            ) : null}

            {Object.keys(riskFlags).length > 0 ? (
              <div className="w-full max-w-4xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm font-semibold text-amber-800">
                  Heads up — we found some similarities with existing records.
                </p>
                <p className="mt-1 text-xs text-amber-700">
                  Your application will go through additional review. This does not prevent you from continuing.
                  {riskFlags.previous_email_attempts > 0
                    ? ` We noticed ${riskFlags.previous_email_attempts} previous attempt(s) with this email.`
                    : ""}
                </p>
              </div>
            ) : null}

            <div className="flex w-full max-w-4xl items-center justify-between">
              <button
                onClick={onBack}
                disabled={isClient ? step === 1 : undefined}
                className={`flex items-center gap-2 rounded-full border px-5 py-2 text-sm font-semibold transition ${
                  step === 1
                    ? "border-[#E2E8F0] text-[#CBD5E1]"
                    : "border-[#E2E8F0] text-[#64748B] hover:border-[#CBD5E1] hover:text-[#0F172A]"
                }`}
              >
                <ChevronLeftIcon className="h-4 w-4" />
                Back
              </button>

              {step === 3 ? (
                <p className="text-sm text-[#64748B]">
                  {isStepLoading
                    ? "Submitting verification…"
                    : "Complete the face guide above — submission is automatic."}
                </p>
              ) : (
                <button
                  onClick={onNext}
                  disabled={isClient ? !canProceed : undefined}
                  className={`flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white transition ${
                    canProceed
                      ? "bg-[var(--brand)]"
                      : "cursor-not-allowed bg-[#9CA3AF]"
                  }`}
                >
                  {isStepLoading ? (
                    <span className="flex items-center gap-2">
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                      {step === 1 ? "Reading document…" : "Saving…"}
                    </span>
                  ) : (
                    <>
                      {primaryAction.label}
                      {primaryAction.icon}
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from "../components/icons";
import Stepper from "../components/Stepper";
import TopNav from "../components/TopNav";
import FaceVerificationStep from "../components/steps/FaceVerificationStep";
import PersonalInfoStep from "../components/steps/PersonalInfoStep";
import UploadDocumentStep from "../components/steps/UploadDocumentStep";
import { addSubmission } from "../admin/submissions";

const steps = [
  { id: 1, label: "Basic Info" },
  { id: 2, label: "Upload Document" },
  { id: 3, label: "Face Verification" },
];

const documentTypes = ["Passport", "Citizenship", "Driving License"];

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [documentType, setDocumentType] = useState("Passport");
  const [isDragging, setIsDragging] = useState(false);
  const [docFile, setDocFile] = useState(null);
  const [docPreviewUrl, setDocPreviewUrl] = useState("");
  const [formData, setFormData] = useState({
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
    email: "",
  });
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
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [isClient, setIsClient] = useState(false);
  const fileInputRef = useRef(null);
  const dobInputRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const recordTimeoutRef = useRef(null);
  const recordChunksRef = useRef([]);

  const primaryAction = useMemo(() => {
    if (step === 3) {
      return {
        label: "Submit Verification",
        icon: <CheckIcon className="h-4 w-4" />,
      };
    }

    return {
      label: "Continue",
      icon: <ChevronRightIcon className="h-4 w-4" />,
    };
  }, [step]);

  const captureSteps = useMemo(
    () => [
      { key: "front", label: "Front", image: faceCaptures.front },
      { key: "left", label: "Left", image: faceCaptures.left },
      { key: "right", label: "Right", image: faceCaptures.right },
    ],
    [faceCaptures]
  );

  const currentCaptureIndex = captureSteps.findIndex((stepItem) => !stepItem.image);
  const hasAllCaptures = currentCaptureIndex === -1;

  useEffect(() => {
    setIsClient(true);
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
    if (!hasAllCaptures) {
      return;
    }
    if (recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.stop();
    }
  }, [hasAllCaptures]);

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

  const validateEmail = (value) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  const validateStepOne = () => {
    const errors = {};

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

    if (formData.email.trim() && !validateEmail(formData.email)) {
      errors.email = "Enter a valid email address.";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateStepTwo = () => {
    const errors = {};

    if (!docFile) {
      errors.document = "Please upload a document to continue.";
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

  const createSubmissionId = () => {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const rand = Math.floor(Math.random() * 9000) + 1000;
    return `KYC-${stamp}-${rand}`;
  };

  const fileToDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const onNext = async () => {
    if (step === 1 && !validateStepOne()) {
      return;
    }

    if (step === 2 && !validateStepTwo()) {
      return;
    }

    if (step === 3) {
      setSubmitError("");
      try {
        const documentImage = docFile ? await fileToDataUrl(docFile) : "";
        const submission = {
          id: createSubmissionId(),
          name: formData.fullName.trim(),
          email: formData.email.trim(),
          dob: formData.dob.trim(),
          gender: formData.gender.trim(),
          nationality: formData.nationality.trim(),
          familySide: formData.familySide.trim(),
          fatherName: formData.fatherName.trim(),
          grandfatherName: formData.grandfatherName.trim(),
          motherName: formData.motherName.trim(),
          grandmotherName: formData.grandmotherName.trim(),
          maritalStatus: formData.maritalStatus.trim(),
          currentAddress: {
            province: formData.currentProvince.trim(),
            district: formData.currentDistrict.trim(),
            municipality: formData.currentMunicipality.trim(),
            ward: formData.currentWard.trim(),
            street: formData.currentStreet.trim(),
          },
          permanentAddress: {
            province: formData.permanentProvince.trim(),
            district: formData.permanentDistrict.trim(),
            municipality: formData.permanentMunicipality.trim(),
            ward: formData.permanentWard.trim(),
            street: formData.permanentStreet.trim(),
          },
          occupation: formData.occupation.trim(),
          panNumber: formData.panNumber.trim(),
          status: "Pending",
          riskScore: 52,
          submittedAt: formatTimestamp(new Date()),
          channel: "Web",
          documentType,
          documentNumber: `DOC-${Math.floor(Math.random() * 900000) + 100000}`,
          documentFileName: docFile?.name || "",
          documentImage,
          faceCaptures,
          faceVideoUrl,
          address: formData.currentProvince.trim(),
        };
        addSubmission(submission);
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
        }
        setCameraReady(false);
        setIsSubmitted(true);
      } catch (error) {
        setSubmitError("Unable to submit right now. Please try again.");
      }
      return;
    }

    if (step < 3) {
      setStep((current) => Math.min(current + 1, 3));
    }
  };

  const onBack = () => {
    setStep((current) => Math.max(current - 1, 1));
  };

  const canProceed = useMemo(() => {
    if (step === 1) {
      return (
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
        (!formData.email.trim() || validateEmail(formData.email))
      );
    }

    if (step === 2) {
      return Boolean(docFile);
    }

    if (step === 3) {
      return cameraReady && hasAllCaptures;
    }

    return true;
  }, [cameraReady, docFile, formData, hasAllCaptures, step]);

  const handleInputChange = (key) => (event) => {
    const value =
      event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setFormData((current) => ({ ...current, [key]: value }));
    setFormErrors((current) => ({ ...current, [key]: undefined }));
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

  const handleFileSelect = (files) => {
    if (!files || files.length === 0) {
      return;
    }
    const [file] = files;
    setDocFile(file);
    setFormErrors((current) => ({ ...current, document: undefined }));
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

  const capturePhoto = () => {
    if (!videoRef.current || currentCaptureIndex === -1) {
      return;
    }
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    const width = video.videoWidth || 720;
    const height = video.videoHeight || 720;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    context.drawImage(video, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    const targetKey = captureSteps[currentCaptureIndex]?.key;
    if (!targetKey) {
      return;
    }
    setFaceCaptures((current) => ({ ...current, [targetKey]: dataUrl }));
  };

  const clearCapturesFrom = (index) => {
    setFaceCaptures((current) => {
      const next = { ...current };
      captureSteps.slice(index).forEach((stepItem) => {
        next[stepItem.key] = null;
      });
      return next;
    });
  };

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
                onClick={() => {
                  setIsSubmitted(false);
                  setStep(1);
                  setFormData({
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
                    email: "",
                  });
                  setDocFile(null);
                  setFaceCaptures({ front: null, left: null, right: null });
                }}
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
                <PersonalInfoStep
                  formData={formData}
                  formErrors={formErrors}
                  onChange={handleInputChange}
                  dobInputRef={dobInputRef}
                />
              )}

              {step === 2 && (
                <UploadDocumentStep
                  documentTypes={documentTypes}
                  documentType={documentType}
                  onSelectType={setDocumentType}
                  isDragging={isDragging}
                  onOpenFilePicker={openFilePicker}
                  onDrop={onDrop}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  fileInputRef={fileInputRef}
                  onFileChange={(event) => handleFileSelect(event.target.files)}
                  docFile={docFile}
                  previewUrl={docPreviewUrl}
                  error={formErrors.document}
                />
              )}

              {step === 3 && (
                <FaceVerificationStep
                  cameraReady={cameraReady}
                  cameraError={cameraError}
                  videoRef={videoRef}
                  onStartCamera={startCamera}
                  captureSteps={captureSteps}
                  currentCaptureIndex={currentCaptureIndex}
                  onCapture={capturePhoto}
                  onRetakeCapture={clearCapturesFrom}
                  onUndoCapture={clearCapturesFrom}
                  recordingStatus={recordingStatus}
                />
              )}
            </section>

            {submitError ? (
              <p className="w-full max-w-4xl rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                {submitError}
              </p>
            ) : null}

            {step === 1 && Object.keys(formErrors).length > 0 ? (
              <p className="w-full max-w-4xl rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                Please fill in all required fields highlighted in red.
              </p>
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

              <button
                onClick={onNext}
                disabled={isClient ? !canProceed : undefined}
                className={`flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white transition ${
                  canProceed
                    ? "bg-[var(--brand)]"
                    : "cursor-not-allowed bg-[#9CA3AF]"
                }`}
              >
                {primaryAction.label}
                {primaryAction.icon}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

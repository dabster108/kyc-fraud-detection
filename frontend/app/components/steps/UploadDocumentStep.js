import { UploadIcon } from "../icons";

export default function UploadDocumentStep({
  documentTypes,
  documentType,
  onSelectType,
  formData,
  formErrors,
  onFieldChange,
  isDragging,
  onOpenFilePicker,
  onOpenFrontFilePicker,
  onOpenBackFilePicker,
  onDrop,
  onDragOver,
  onDragLeave,
  fileInputRef,
  fileFrontInputRef,
  fileBackInputRef,
  onFileChange,
  onFrontFileChange,
  onBackFileChange,
  docFile,
  previewUrl,
  docFrontFile,
  docBackFile,
  frontPreviewUrl,
  backPreviewUrl,
}) {
  const fieldClass = (hasError) =>
    `w-full rounded-xl border bg-[#F8FAFC] px-4 py-3 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 ${
      hasError
        ? "border-red-400 focus:border-red-400 focus:ring-[rgba(225,29,72,0.2)]"
        : "border-[#E2E8F0] focus:border-[var(--brand)] focus:ring-[rgba(82,196,26,0.2)]"
    }`;

  const isCitizenship = documentType === "Citizenship";
  const documentNumberLabel =
    documentType === "Citizenship" ? "Citizenship Number" : "Document Number";

  const SingleUploadCard = () => (
    <>
      {previewUrl ? (
        <div className="flex flex-col items-center gap-3">
          <div
            role="button"
            tabIndex={0}
            onClick={onOpenFilePicker}
            onKeyDown={(event) =>
              event.key === "Enter" ? onOpenFilePicker() : null
            }
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            className={`flex w-full cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed px-6 py-6 transition ${
              isDragging
                ? "border-[var(--brand)] bg-[rgba(82,196,26,0.08)]"
                : "border-[#CBD5E1] bg-[#F8FAFC]"
            }`}
          >
            <img
              src={previewUrl}
              alt="Uploaded document preview"
              className="max-h-56 w-full max-w-md rounded-xl object-contain"
            />
          </div>
          <p className="text-xs font-medium text-[#0F172A]">{docFile?.name}</p>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={onOpenFilePicker}
          onKeyDown={(event) =>
            event.key === "Enter" ? onOpenFilePicker() : null
          }
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          className={`flex cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-6 py-16 text-center transition ${
            isDragging
              ? "border-[var(--brand)] bg-[rgba(82,196,26,0.08)]"
              : "border-[#CBD5E1] bg-[#F8FAFC]"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onFileChange}
          />
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#E2E8F0] text-[#64748B]">
            <UploadIcon className="h-8 w-8" />
          </span>
          <div className="space-y-1">
            <p className="text-base font-semibold text-[#0F172A]">
              Drag &amp; drop your document here
            </p>
            <p className="text-sm text-[#94A3B8]">or click to browse files</p>
          </div>
        </div>
      )}
      {formErrors.document && (
        <p className="text-xs font-medium text-[#E11D48]">{formErrors.document}</p>
      )}
    </>
  );

  const CitizenshipUploadCard = ({
    label,
    preview,
    file,
    onOpen,
    onChange,
    inputRef,
    error,
  }) => (
    <div className="space-y-2">
      <p className="text-sm font-medium text-[#475569]">{label}</p>
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(event) => (event.key === "Enter" ? onOpen() : null)}
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition ${
          error
            ? "border-red-300 bg-red-50"
            : "border-[#CBD5E1] bg-[#F8FAFC] hover:border-[var(--brand)]"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onChange}
        />
        {preview ? (
          <img
            src={preview}
            alt={`${label} preview`}
            className="max-h-40 w-full rounded-xl object-contain"
          />
        ) : (
          <>
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#E2E8F0] text-[#64748B]">
              <UploadIcon className="h-6 w-6" />
            </span>
            <p className="text-sm font-semibold text-[#0F172A]">Upload image</p>
          </>
        )}
      </div>
      <p className="text-xs text-[#64748B]">{file?.name || "No file selected"}</p>
      {error && <p className="text-xs font-medium text-[#E11D48]">{error}</p>}
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="font-display text-3xl text-[#0B1324]">
          Upload Identity Document
        </h1>
        <p className="text-sm text-[#64748B]">
          Upload a clear photo of your passport, citizenship, or driving license
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        {documentTypes.map((type) => {
          const isActive = documentType === type;
          return (
            <button
              key={type}
              onClick={() => onSelectType(type)}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                isActive
                  ? "bg-[var(--brand)] text-white shadow-[0_6px_16px_rgba(82,196,26,0.35)]"
                  : "bg-[#F1F5F9] text-[#475569] hover:text-[#0F172A]"
              }`}
            >
              {type}
            </button>
          );
        })}
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium text-[#475569]">
            {documentNumberLabel}
          </label>
          <input
            type="text"
            value={formData.documentNumber}
            onChange={onFieldChange("documentNumber")}
            className={fieldClass(formErrors.documentNumber)}
            placeholder={
              isCitizenship ? "Enter citizenship number" : "Enter document number"
            }
          />
          {formErrors.documentNumber && (
            <p className="text-xs font-medium text-[#E11D48]">
              {formErrors.documentNumber}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-[#475569]">Issued Date</label>
          <input
            type="date"
            value={formData.documentIssuedDate}
            onChange={onFieldChange("documentIssuedDate")}
            className={fieldClass(formErrors.documentIssuedDate)}
          />
          {formErrors.documentIssuedDate && (
            <p className="text-xs font-medium text-[#E11D48]">
              {formErrors.documentIssuedDate}
            </p>
          )}
        </div>

        <div className="space-y-2 md:col-span-3">
          <label className="text-sm font-medium text-[#475569]">Issued Place</label>
          <input
            type="text"
            value={formData.documentIssuedPlace}
            onChange={onFieldChange("documentIssuedPlace")}
            className={fieldClass(formErrors.documentIssuedPlace)}
            placeholder="District/Office that issued the document"
          />
          {formErrors.documentIssuedPlace && (
            <p className="text-xs font-medium text-[#E11D48]">
              {formErrors.documentIssuedPlace}
            </p>
          )}
        </div>
      </div>

      {isCitizenship ? (
        <div className="grid gap-5 md:grid-cols-2">
          <CitizenshipUploadCard
            label="Citizenship Front"
            preview={frontPreviewUrl}
            file={docFrontFile}
            onOpen={onOpenFrontFilePicker}
            onChange={onFrontFileChange}
            inputRef={fileFrontInputRef}
            error={formErrors.documentFront}
          />
          <CitizenshipUploadCard
            label="Citizenship Back"
            preview={backPreviewUrl}
            file={docBackFile}
            onOpen={onOpenBackFilePicker}
            onChange={onBackFileChange}
            inputRef={fileBackInputRef}
            error={formErrors.documentBack}
          />
        </div>
      ) : (
        <SingleUploadCard />
      )}
    </div>
  );
}

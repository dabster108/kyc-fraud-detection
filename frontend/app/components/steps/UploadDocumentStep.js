import { UploadIcon } from "../icons";

export default function UploadDocumentStep({
  documentTypes,
  documentType,
  onSelectType,
  isDragging,
  onOpenFilePicker,
  onDrop,
  onDragOver,
  onDragLeave,
  fileInputRef,
  onFileChange,
  docFile,
  previewUrl,
  error,
}) {
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
          <p className="text-xs font-medium text-[#0F172A]">
            {docFile?.name}
          </p>
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
      {error && (
        <p className="text-xs font-medium text-[#E11D48]">{error}</p>
      )}
    </div>
  );
}

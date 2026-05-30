import { MailIcon, PhoneIcon, UserIcon } from "../icons";

const DISTRICTS_BY_PROVINCE = {
  Koshi: [
    "Bhojpur",
    "Dhankuta",
    "Ilam",
    "Jhapa",
    "Khotang",
    "Morang",
    "Okhaldhunga",
    "Panchthar",
    "Sankhuwasabha",
    "Solukhumbu",
    "Sunsari",
    "Taplejung",
    "Terhathum",
    "Udayapur",
  ],
  Madhesh: [
    "Bara",
    "Dhanusha",
    "Mahottari",
    "Parsa",
    "Rautahat",
    "Saptari",
    "Sarlahi",
    "Siraha",
  ],
  Bagmati: [
    "Bhaktapur",
    "Chitwan",
    "Dhading",
    "Dolakha",
    "Kathmandu",
    "Kavrepalanchok",
    "Lalitpur",
    "Makwanpur",
    "Nuwakot",
    "Ramechhap",
    "Rasuwa",
    "Sindhuli",
    "Sindhupalchok",
  ],
  Gandaki: [
    "Baglung",
    "Gorkha",
    "Kaski",
    "Lamjung",
    "Manang",
    "Mustang",
    "Myagdi",
    "Nawalpur",
    "Parbat",
    "Syangja",
    "Tanahun",
  ],
  Lumbini: [
    "Arghakhanchi",
    "Banke",
    "Bardiya",
    "Dang",
    "Eastern Rukum",
    "Gulmi",
    "Kapilvastu",
    "Palpa",
    "Parasi",
    "Pyuthan",
    "Rolpa",
    "Rupandehi",
  ],
  Karnali: [
    "Dailekh",
    "Dolpa",
    "Humla",
    "Jajarkot",
    "Jumla",
    "Kalikot",
    "Mugu",
    "Salyan",
    "Surkhet",
    "Western Rukum",
  ],
  Sudurpashchim: [
    "Achham",
    "Baitadi",
    "Bajhang",
    "Bajura",
    "Dadeldhura",
    "Darchula",
    "Doti",
    "Kailali",
    "Kanchanpur",
  ],
};

const NATIONALITY_OPTIONS = [
  "Nepali",
  "Indian",
  "Bhutanese",
  "Bangladeshi",
  "Chinese",
  "Other",
];

export default function PersonalInfoStep({
  formData,
  formErrors,
  onChange,
  dobInputRef,
}) {
  const fieldClass = (hasError) =>
    `w-full rounded-xl border bg-[#F8FAFC] px-4 py-3 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 ${
      hasError
        ? "border-red-400 focus:border-red-400 focus:ring-[rgba(82,196,26,0.2)]"
        : "border-[#E2E8F0] focus:border-[var(--brand)] focus:ring-[rgba(82,196,26,0.2)]"
    }`;

  const currentDistricts =
    DISTRICTS_BY_PROVINCE[formData.currentProvince] || [];
  const permanentDistricts =
    DISTRICTS_BY_PROVINCE[formData.permanentProvince] || [];

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="font-display text-3xl text-[#0B1324]">
          Basic information
        </h1>
        <p className="text-sm text-[#64748B]">
          Fill in details exactly as they appear on your identity document.
        </p>
      </div>

      <div className="space-y-10">
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0F172A] text-sm font-semibold text-white">
              1
            </span>
            <div>
              <p className="text-sm font-semibold text-[#0F172A]">
                Residence &amp; Identity
              </p>
              <p className="text-xs text-[#64748B]">Personal details</p>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#475569]">
                Nationality <span className="text-[#E11D48]">*</span>
              </label>
              <select
                value={formData.nationality}
                onChange={onChange("nationality")}
                className={fieldClass(formErrors.nationality)}
              >
                <option value="">Select nationality</option>
                {NATIONALITY_OPTIONS.map((nationality) => (
                  <option key={nationality} value={nationality}>
                    {nationality}
                  </option>
                ))}
              </select>
              {formErrors.nationality && (
                <p className="text-xs font-medium text-[#E11D48]">
                  {formErrors.nationality}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-[#475569]">
                <UserIcon className="h-4 w-4 text-[#94A3B8]" />
                Full Name (as on document)
              </label>
              <input
                type="text"
                placeholder="Pratik Joshi"
                value={formData.fullName}
                onChange={onChange("fullName")}
                className={fieldClass(formErrors.fullName)}
              />
              {formErrors.fullName && (
                <p className="text-xs font-medium text-[#E11D48]">
                  {formErrors.fullName}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#475569]">
                Date of Birth <span className="text-[#E11D48]">*</span>
              </label>
              <input
                ref={dobInputRef}
                type="date"
                value={formData.dob}
                onChange={onChange("dob")}
                className={fieldClass(formErrors.dob)}
              />
              {formErrors.dob && (
                <p className="text-xs font-medium text-[#E11D48]">
                  {formErrors.dob}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#475569]">Gender <span className="text-[#E11D48]">*</span></label>
              <select
                value={formData.gender}
                onChange={onChange("gender")}
                className={fieldClass(formErrors.gender)}
              >
                <option value="">Select</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
              {formErrors.gender && (
                <p className="text-xs font-medium text-[#E11D48]">
                  {formErrors.gender}
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0F172A] text-sm font-semibold text-white">
              2
            </span>
            <div>
              <p className="text-sm font-semibold text-[#0F172A]">Family Information</p>
              <p className="text-xs text-[#64748B]">Family side details</p>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-[#475569]">Family side</label>
              <div
                className={`flex flex-wrap gap-3 rounded-2xl border p-3 ${
                  formErrors.familySide ? "border-red-400" : "border-transparent"
                }`}
              >
                {["Father's side", "Mother's side"].map((side) => (
                  <label
                    key={side}
                    className={`cursor-pointer rounded-full border px-4 py-2 text-xs font-semibold ${
                      formData.familySide === side
                        ? "border-[var(--brand)] bg-[rgba(82,196,26,0.12)] text-[var(--brand)]"
                        : "border-[#E2E8F0] text-[#64748B]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="familySide"
                      value={side}
                      checked={formData.familySide === side}
                      onChange={onChange("familySide")}
                      className="sr-only"
                    />
                    {side}
                  </label>
                ))}
              </div>
              {formErrors.familySide && (
                <p className="text-xs font-medium text-[#E11D48]">
                  {formErrors.familySide}
                </p>
              )}
            </div>

            {formData.familySide === "Father's side" && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#475569]">
                    Father's / Husband's Name <span className="text-[#E11D48]">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Ram Bahadur Shrestha"
                    value={formData.fatherName}
                    onChange={onChange("fatherName")}
                    className={fieldClass(formErrors.fatherName)}
                  />
                  {formErrors.fatherName && (
                    <p className="text-xs font-medium text-[#E11D48]">
                      {formErrors.fatherName}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#475569]">
                    Grandfather's / Father-in-law's Name <span className="text-[#E11D48]">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Hari Prasad Shrestha"
                    value={formData.grandfatherName}
                    onChange={onChange("grandfatherName")}
                    className={fieldClass(formErrors.grandfatherName)}
                  />
                  {formErrors.grandfatherName && (
                    <p className="text-xs font-medium text-[#E11D48]">
                      {formErrors.grandfatherName}
                    </p>
                  )}
                </div>
              </>
            )}

            {formData.familySide === "Mother's side" && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#475569]">
                    Mother's / Wife's Name <span className="text-[#E11D48]">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Sita Devi Karki"
                    value={formData.motherName}
                    onChange={onChange("motherName")}
                    className={fieldClass(formErrors.motherName)}
                  />
                  {formErrors.motherName && (
                    <p className="text-xs font-medium text-[#E11D48]">
                      {formErrors.motherName}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#475569]">
                    Grandmother's / Mother-in-law's Name <span className="text-[#E11D48]">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Kamala Devi Karki"
                    value={formData.grandmotherName}
                    onChange={onChange("grandmotherName")}
                    className={fieldClass(formErrors.grandmotherName)}
                  />
                  {formErrors.grandmotherName && (
                    <p className="text-xs font-medium text-[#E11D48]">
                      {formErrors.grandmotherName}
                    </p>
                  )}
                </div>
              </>
            )}

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-[#475569]">Marital status</label>
              <div
                className={`flex flex-wrap gap-3 rounded-2xl border p-3 ${
                  formErrors.maritalStatus ? "border-red-400" : "border-transparent"
                }`}
              >
                {["Single", "Married", "Divorced", "Widowed"].map((status) => (
                  <label
                    key={status}
                    className={`cursor-pointer rounded-full border px-4 py-2 text-xs font-semibold ${
                      formData.maritalStatus === status
                        ? "border-[var(--brand)] bg-[rgba(82,196,26,0.12)] text-[var(--brand)]"
                        : "border-[#E2E8F0] text-[#64748B]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="maritalStatus"
                      value={status}
                      checked={formData.maritalStatus === status}
                      onChange={onChange("maritalStatus")}
                      className="sr-only"
                    />
                    {status}
                  </label>
                ))}
              </div>
              {formErrors.maritalStatus && (
                <p className="text-xs font-medium text-[#E11D48]">
                  {formErrors.maritalStatus}
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0F172A] text-sm font-semibold text-white">
              3
            </span>
            <div>
              <p className="text-sm font-semibold text-[#0F172A]">Current Address</p>
              <p className="text-xs text-[#64748B]">Where you currently reside</p>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#475569]">Province</label>
              <select
                value={formData.currentProvince}
                onChange={onChange("currentProvince")}
                className={fieldClass(formErrors.currentProvince)}
              >
                <option value="">Select province</option>
                <option value="Koshi">Koshi</option>
                <option value="Madhesh">Madhesh</option>
                <option value="Bagmati">Bagmati</option>
                <option value="Gandaki">Gandaki</option>
                <option value="Lumbini">Lumbini</option>
                <option value="Karnali">Karnali</option>
                <option value="Sudurpashchim">Sudurpashchim</option>
              </select>
              {formErrors.currentProvince && (
                <p className="text-xs font-medium text-[#E11D48]">
                  {formErrors.currentProvince}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#475569]">District</label>
              <select
                value={formData.currentDistrict}
                onChange={onChange("currentDistrict")}
                disabled={!formData.currentProvince}
                className={`${fieldClass(formErrors.currentDistrict)} disabled:cursor-not-allowed disabled:text-[#94A3B8]`}
              >
                <option value="">Select district</option>
                {currentDistricts.map((district) => (
                  <option key={district} value={district}>
                    {district}
                  </option>
                ))}
              </select>
              {formErrors.currentDistrict && (
                <p className="text-xs font-medium text-[#E11D48]">
                  {formErrors.currentDistrict}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#475569]">
                Municipality / VDC <span className="text-[#E11D48]">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Kathmandu Metropolitan City"
                value={formData.currentMunicipality}
                onChange={onChange("currentMunicipality")}
                className={fieldClass(formErrors.currentMunicipality)}
              />
              {formErrors.currentMunicipality && (
                <p className="text-xs font-medium text-[#E11D48]">
                  {formErrors.currentMunicipality}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#475569]">
                Ward No. <span className="text-[#E11D48]">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. 10"
                value={formData.currentWard}
                onChange={onChange("currentWard")}
                className={fieldClass(formErrors.currentWard)}
              />
              {formErrors.currentWard && (
                <p className="text-xs font-medium text-[#E11D48]">
                  {formErrors.currentWard}
                </p>
              )}
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-[#475569]">
                Street / Tole <span className="text-[#94A3B8] font-normal">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Putalisadak, Tole 3"
                value={formData.currentStreet}
                onChange={onChange("currentStreet")}
                className={fieldClass(false)}
              />
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0F172A] text-sm font-semibold text-white">
              4
            </span>
            <div>
              <p className="text-sm font-semibold text-[#0F172A]">Permanent Address</p>
              <p className="text-xs text-[#64748B]">As recorded on your citizenship</p>
            </div>
          </div>

          <label className="flex items-center gap-3 text-sm font-medium text-[#475569]">
            <input
              type="checkbox"
              checked={formData.permanentSame}
              onChange={onChange("permanentSame")}
              className="h-4 w-4 rounded border-[#CBD5E1] text-[var(--brand)] focus:ring-[rgba(82,196,26,0.2)]"
            />
            Same as current address
          </label>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#475569]">Province</label>
              <select
                value={formData.permanentProvince}
                onChange={onChange("permanentProvince")}
                disabled={formData.permanentSame}
                className={`${fieldClass(formErrors.permanentProvince)} disabled:cursor-not-allowed disabled:text-[#94A3B8]`}
              >
                <option value="">Select province</option>
                <option value="Koshi">Koshi</option>
                <option value="Madhesh">Madhesh</option>
                <option value="Bagmati">Bagmati</option>
                <option value="Gandaki">Gandaki</option>
                <option value="Lumbini">Lumbini</option>
                <option value="Karnali">Karnali</option>
                <option value="Sudurpashchim">Sudurpashchim</option>
              </select>
              {formErrors.permanentProvince && (
                <p className="text-xs font-medium text-[#E11D48]">
                  {formErrors.permanentProvince}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#475569]">District</label>
              <select
                value={formData.permanentDistrict}
                onChange={onChange("permanentDistrict")}
                disabled={formData.permanentSame || !formData.permanentProvince}
                className={`${fieldClass(formErrors.permanentDistrict)} disabled:cursor-not-allowed disabled:text-[#94A3B8]`}
              >
                <option value="">Select district</option>
                {permanentDistricts.map((district) => (
                  <option key={district} value={district}>
                    {district}
                  </option>
                ))}
              </select>
              {formErrors.permanentDistrict && (
                <p className="text-xs font-medium text-[#E11D48]">
                  {formErrors.permanentDistrict}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#475569]">
                Municipality / VDC <span className="text-[#E11D48]">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Pokhara Metropolitan City"
                value={formData.permanentMunicipality}
                onChange={onChange("permanentMunicipality")}
                disabled={formData.permanentSame}
                className={`${fieldClass(formErrors.permanentMunicipality)} disabled:cursor-not-allowed disabled:text-[#94A3B8]`}
              />
              {formErrors.permanentMunicipality && (
                <p className="text-xs font-medium text-[#E11D48]">
                  {formErrors.permanentMunicipality}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#475569]">
                Ward No. <span className="text-[#E11D48]">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. 5"
                value={formData.permanentWard}
                onChange={onChange("permanentWard")}
                disabled={formData.permanentSame}
                className={`${fieldClass(formErrors.permanentWard)} disabled:cursor-not-allowed disabled:text-[#94A3B8]`}
              />
              {formErrors.permanentWard && (
                <p className="text-xs font-medium text-[#E11D48]">
                  {formErrors.permanentWard}
                </p>
              )}
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-[#475569]">
                Street / Tole <span className="text-[#94A3B8] font-normal">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Lakeside, Ward 6"
                value={formData.permanentStreet}
                onChange={onChange("permanentStreet")}
                disabled={formData.permanentSame}
                className={`${fieldClass(false)} disabled:cursor-not-allowed disabled:text-[#94A3B8]`}
              />
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0F172A] text-sm font-semibold text-white">
              5
            </span>
            <div>
              <p className="text-sm font-semibold text-[#0F172A]">Contact & Occupation</p>
              <p className="text-xs text-[#64748B]">Phone is required — email is optional</p>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#475569]">
                Occupation <span className="text-[#E11D48]">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Software Engineer, Farmer, Student"
                value={formData.occupation}
                onChange={onChange("occupation")}
                className={fieldClass(formErrors.occupation)}
              />
              {formErrors.occupation && (
                <p className="text-xs font-medium text-[#E11D48]">
                  {formErrors.occupation}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#475569]">
                PAN Number <span className="text-[#94A3B8] font-normal">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. 123456789"
                value={formData.panNumber}
                onChange={onChange("panNumber")}
                className={fieldClass(false)}
              />
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-[#475569]">
                <PhoneIcon className="h-4 w-4 text-[#94A3B8]" />
                Phone Number
              </label>
              <input
                type="tel"
                placeholder="98XXXXXXXX"
                value={formData.phone}
                onChange={onChange("phone")}
                className={fieldClass(formErrors.phone)}
              />
              {formErrors.phone && (
                <p className="text-xs font-medium text-[#E11D48]">
                  {formErrors.phone}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-[#475569]">
                <MailIcon className="h-4 w-4 text-[#94A3B8]" />
                Email Address <span className="text-[#94A3B8] font-normal">(optional)</span>
              </label>
              <input
                type="email"
                placeholder="your@email.com"
                value={formData.email}
                onChange={onChange("email")}
                className={fieldClass(formErrors.email)}
              />
              {formErrors.email && (
                <p className="text-xs font-medium text-[#E11D48]">
                  {formErrors.email}
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

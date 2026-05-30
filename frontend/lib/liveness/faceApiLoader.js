const FACE_API_SCRIPT =
  "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js";
const MODEL_URL =
  "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights";

let loadPromise = null;

function loadScript() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("face-api can only load in the browser"));
  }
  if (window.faceapi) {
    return Promise.resolve(window.faceapi);
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${FACE_API_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(window.faceapi));
      existing.addEventListener("error", reject);
      return;
    }
    const script = document.createElement("script");
    script.src = FACE_API_SCRIPT;
    script.async = true;
    script.onload = () => resolve(window.faceapi);
    script.onerror = () => reject(new Error("Failed to load face-api.js"));
    document.head.appendChild(script);
  });
}

export async function loadFaceApiModels() {
  if (loadPromise) {
    return loadPromise;
  }
  loadPromise = (async () => {
    const faceapi = await loadScript();
    await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
    await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
    return faceapi;
  })();
  return loadPromise;
}

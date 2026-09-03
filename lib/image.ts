export interface LoadedImage {
  /** Full-quality bitmap used for rendering and download. */
  element: HTMLImageElement;
  width: number;
  height: number;
  /** Downscaled JPEG data URL sent to Claude, to keep the request small. */
  apiDataUrl: string;
  name: string;
}

const API_MAX_EDGE = 1024;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

function loadElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That file is not a readable image."));
    img.src = src;
  });
}

/** Shrinks the photo before it goes to the API — vision tokens scale with area. */
function toApiDataUrl(img: HTMLImageElement): string {
  const scale = Math.min(1, API_MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable in this browser.");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

export async function loadImageFile(file: File): Promise<LoadedImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Drop an image file (JPEG, PNG, WebP or GIF).");
  }
  const dataUrl = await readAsDataUrl(file);
  const element = await loadElement(dataUrl);
  return {
    element,
    width: element.naturalWidth,
    height: element.naturalHeight,
    apiDataUrl: toApiDataUrl(element),
    name: file.name.replace(/\.[^.]+$/, "") || "meme",
  };
}

// Browser-only: shrink a phone photo before it goes to the model. Big photos
// cost time and don't read any better.

export interface PreparedImage {
  base64: string;
  dataUrl: string;
  width: number;
  height: number;
}

export async function prepareImage(file: Blob, maxSide = 1600): Promise<PreparedImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Can't open this image. Use a JPG or PNG photo.");
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser can't prepare images.");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  return { dataUrl, base64: dataUrl.slice(dataUrl.indexOf(",") + 1), width, height };
}

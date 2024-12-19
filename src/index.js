const { Jimp } = require("jimp");
const fs = require("fs");
const { decodeQR } = require("@paulmillr/qr/decode.js");
const { Bitmap } = require("@paulmillr/qr");
const base64 = require("base64-js");
const protobuf = require("protobufjs");

const WHITELIST_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg"];
const INPUT_DIRECTORY = "input";

function generateOtpauthUrl(otpParams) {
  const { secret, name, issuer, algorithm, digits, type } = otpParams;

  // Convert secret from bytes to base32
  const base32Secret = base32Encode(secret);

  // Determine the OTP type (TOTP or HOTP)
  const otpType = type === "OTP_TYPE_HOTP" ? "hotp" : "totp";

  // Build the URL
  let url = `otpauth://${otpType}/${encodeURIComponent(
    issuer
  )}:${encodeURIComponent(name)}?secret=${base32Secret}`;

  // Add optional parameters
  if (issuer) url += `&issuer=${encodeURIComponent(issuer)}`;
  if (algorithm && algorithm !== "ALGORITHM_TYPE_UNSPECIFIED")
    url += `&algorithm=${algorithm}`;
  if (digits && digits !== "DIGIT_COUNT_UNSPECIFIED")
    url += `&digits=${digits === "EIGHT" ? 8 : 6}`;

  // Add counter for HOTP
  if (otpType === "hotp" && otpParams.counter)
    url += `&counter=${otpParams.counter}`;

  return url;

  function base32Encode(buffer) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = 0;
    let value = 0;
    let output = "";

    for (let i = 0; i < buffer.length; i++) {
      value = (value << 8) | buffer[i];
      bits += 8;
      while (bits >= 5) {
        output += alphabet[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) {
      output += alphabet[(value << (5 - bits)) & 31];
    }
    return output;
  }
}

async function decodeMigrationUrl(url) {
  // Extract the data part from the URL
  const data = decodeURIComponent(url.split("data=")[1]);

  // Decode the base64 data
  const decodedData = base64.toByteArray(data);

  // Load the protobuf schema
  const root = await protobuf.load("src/OtpMigration.proto");

  const MigrationPayload = root.lookupType("MigrationPayload");

  // Decode the protobuf message
  const message = MigrationPayload.decode(decodedData);

  // Convert to a plain JavaScript object
  return MigrationPayload.toObject(message, { enums: String });
}

async function decodeQrCode(imagePath) {
  try {
    // Read the image file using Jimp
    const image = await Jimp.read(imagePath);

    // Get image data
    const { width, height, data } = image.bitmap;

    // Create a Bitmap object compatible with paulmillr-qr
    const bitmap = new Bitmap({ width, height });

    // Populate the bitmap with image data
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        // Convert to grayscale and set the pixel
        const gray = (r + g + b) / 3;
        bitmap.data[y][x] = gray < 128 ? 1 : 0;
      }
    }

    // Decode the QR code
    const decoded = decodeQR(bitmap.toImage());

    return decoded;
  } catch (error) {
    console.error("Error decoding QR code:", error);
    throw error;
  }
}

async function listImages() {
  const inputDirExists = fs.existsSync(INPUT_DIRECTORY);
  if (!inputDirExists) {
    throw new Error("Input directory not found.");
  }
  const images = await fs.promises.readdir(INPUT_DIRECTORY);
  return images
    .filter((image) =>
      WHITELIST_IMAGE_EXTENSIONS.some((ext) =>
        image.toLowerCase().endsWith(ext)
      )
    )
    .map((image) => `${INPUT_DIRECTORY}/${image}`);
}

async function main() {
  const images = await listImages();
  // console.log("images", images);
  const exportedUrls = await Promise.all(images.map(decodeQrCode));
  // console.log("exportedUrls", exportedUrls);
  const decodedUrlData = (
    await Promise.all(exportedUrls.map(decodeMigrationUrl))
  ).flatMap((x) => x.otpParameters);
  // console.log("decodedUrlData", decodedUrlData);
  const decodedUrls = await Promise.all(decodedUrlData.map(generateOtpauthUrl));
  // console.log("decodedUrls", decodedUrls);
  await fs.writeFileSync("output.data", decodedUrls.join("\n"));
}

main();

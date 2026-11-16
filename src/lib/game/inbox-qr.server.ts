import "server-only";
import QRCode from "qrcode";

export function inboxQrTarget(origin: string) {
  const url = new URL(origin);
  const host = url.hostname.replace(/\.$/, "");
  const privateAddress = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash || host === "localhost" || host.endsWith(".localhost") || host === "[::1]" || host === "[::]" || /^(127\.|0\.)/.test(host) || (url.protocol !== "https:" && !(url.protocol === "http:" && privateAddress))) {
    throw new Error("Use the application's public HTTPS origin or its reachable private LAN HTTP origin. Loopback URLs cannot be printed for phones.");
  }
  return new URL("/clue/inbox", url.origin).href;
}

export async function inboxQr(origin: string) {
  const target = inboxQrTarget(origin);
  return { target, image: await QRCode.toDataURL(target, { errorCorrectionLevel: "M", margin: 4, width: 480, color: { dark: "#000000", light: "#ffffff" } }) };
}

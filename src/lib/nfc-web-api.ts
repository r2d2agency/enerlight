// Thin wrapper around the Web NFC API (Chrome on Android over HTTPS).
// Falls back gracefully on unsupported browsers.

export function isWebNfcSupported(): boolean {
  return typeof window !== "undefined" && "NDEFReader" in window;
}

export interface ScanResult {
  uid?: string;
  chipType?: string;
  records?: any[];
}

export async function scanNfcTag(timeoutMs = 30000): Promise<ScanResult> {
  if (!isWebNfcSupported()) {
    throw new Error("Web NFC não suportado neste dispositivo. Use Chrome no Android.");
  }
  // @ts-ignore
  const reader = new (window as any).NDEFReader();
  await reader.scan();
  return await new Promise<ScanResult>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Tempo esgotado aguardando o cartão")), timeoutMs);
    reader.onreading = (event: any) => {
      clearTimeout(timer);
      const uidBytes: Uint8Array | undefined = event.serialNumber
        ? hexFromString(event.serialNumber)
        : undefined;
      resolve({
        uid: event.serialNumber ? String(event.serialNumber).toUpperCase() : undefined,
        records: event.message?.records || [],
      });
    };
    reader.onreadingerror = () => {
      clearTimeout(timer);
      reject(new Error("Erro lendo cartão NFC"));
    };
  });
}

export async function writeNfcUrl(url: string): Promise<void> {
  if (!isWebNfcSupported()) {
    throw new Error("Web NFC não suportado. Use o app NFC Tools para gravar manualmente.");
  }
  // @ts-ignore
  const writer = new (window as any).NDEFReader();
  await writer.write({ records: [{ recordType: "url", data: url }] });
}

function hexFromString(s: string): Uint8Array {
  const clean = s.replace(/[^0-9a-f]/gi, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

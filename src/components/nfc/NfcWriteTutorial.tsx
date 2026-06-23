import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info } from "lucide-react";

export function NfcWriteTutorial({ url }: { url: string }) {
  return (
    <Alert>
      <Info className="h-4 w-4" />
      <AlertTitle>Gravação manual com NFC Tools</AlertTitle>
      <AlertDescription>
        <p className="mb-2">
          Seu navegador não suporta Web NFC. Para gravar a tag, use o app gratuito{" "}
          <a className="underline" href="https://play.google.com/store/apps/details?id=com.wakdev.wdnfc" target="_blank" rel="noreferrer">
            NFC Tools (Android)
          </a>{" "}
          ou <strong>NFC Tools (iOS)</strong>.
        </p>
        <ol className="list-decimal pl-5 space-y-1 text-sm">
          <li>Abra o NFC Tools e toque em <strong>Escrever</strong>.</li>
          <li>Selecione <strong>Adicionar um registro → URL/URI</strong>.</li>
          <li>Cole a URL: <code className="bg-muted px-1 rounded">{url}</code></li>
          <li>Toque em <strong>Escrever</strong> e aproxime o cartão NFC.</li>
        </ol>
      </AlertDescription>
    </Alert>
  );
}

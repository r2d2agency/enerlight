import { MessageItem } from "./MessageItemEditor";
import { Image, Video, Mic } from "lucide-react";

interface MessagePreviewProps {
  items: MessageItem[];
  previewName: string;
}

export function MessagePreview({ items, previewName }: MessagePreviewProps) {
  const replaceVariables = (text: string) => {
    return text.replace(/\{\{nome\}\}/gi, previewName);
  };

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        Adicione mensagens para ver o preview...
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.id} className="flex justify-end">
          <div className="max-w-[85%] rounded-lg bg-[#dcf8c6] px-3 py-2 shadow-sm">
            {/* Media content */}
            {item.type === "image" && (
              <div className="mb-2 rounded overflow-hidden">
                {item.mediaUrl ? (
                  <img
                    src={item.mediaUrl}
                    alt="Preview"
                    className="max-w-full max-h-48 object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                      e.currentTarget.nextElementSibling?.classList.remove("hidden");
                    }}
                  />
                ) : null}
                <div className={`flex items-center justify-center h-24 bg-gray-200 ${item.mediaUrl ? "hidden" : ""}`}>
                  <Image className="h-8 w-8 text-gray-400" />
                </div>
              </div>
            )}

            {item.type === "video" && (
              <div className="mb-2 flex items-center justify-center h-24 bg-gray-200 rounded">
                <Video className="h-8 w-8 text-gray-400" />
              </div>
            )}

            {item.type === "audio" && (
              <div className="mb-2 flex items-center gap-2 bg-gray-200 rounded-full px-4 py-2">
                <Mic className="h-4 w-4 text-gray-500" />
                <div className="flex-1 h-1 bg-gray-300 rounded-full">
                  <div className="w-1/3 h-full bg-gray-500 rounded-full" />
                </div>
                <span className="text-xs text-gray-500">0:00</span>
              </div>
            )}

            {/* Text/Caption */}
            {(item.type === "text" ? item.content : item.caption) && (
              <p className="text-sm text-gray-800 whitespace-pre-wrap">
                {replaceVariables(item.type === "text" ? item.content : item.caption || "")}
              </p>
            )}

            <p className="mt-1 text-right text-[10px] text-gray-500">
              12:00 ✓✓
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

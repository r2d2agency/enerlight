import { useState, useEffect, memo } from "react";
import { ExternalLink } from "lucide-react";

interface LinkPreviewData {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

const previewCache = new Map<string, LinkPreviewData | null>();

function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
  return text.match(urlRegex) || [];
}

export function renderTextWithLinks(text: string, highlightFn?: (text: string, query: string) => React.ReactNode, searchQuery?: string): React.ReactNode {
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/gi;
  const parts = text.split(urlRegex);

  if (parts.length === 1) {
    return searchQuery && highlightFn ? highlightFn(text, searchQuery) : text;
  }

  return parts.map((part, i) => {
    if (urlRegex.test(part)) {
      // Reset regex lastIndex
      urlRegex.lastIndex = 0;
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 dark:text-blue-400 underline break-all hover:opacity-80"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    // Reset regex lastIndex
    urlRegex.lastIndex = 0;
    return searchQuery && highlightFn ? <span key={i}>{highlightFn(part, searchQuery)}</span> : part;
  });
}

export const LinkPreviewCard = memo(({ url }: { url: string }) => {
  const [preview, setPreview] = useState<LinkPreviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (previewCache.has(url)) {
      setPreview(previewCache.get(url) || null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const fetchPreview = async () => {
      try {
        // Use a free OG data proxy
        const res = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`);
        const data = await res.json();
        if (cancelled) return;

        if (data.status === "success" && data.data) {
          const pd: LinkPreviewData = {
            url,
            title: data.data.title,
            description: data.data.description,
            image: data.data.image?.url,
            siteName: data.data.publisher,
          };
          previewCache.set(url, pd);
          setPreview(pd);
        } else {
          previewCache.set(url, null);
        }
      } catch {
        previewCache.set(url, null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchPreview();
    return () => { cancelled = true; };
  }, [url]);

  if (loading || !preview || (!preview.title && !preview.image)) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-lg border border-border/50 overflow-hidden mb-2 hover:bg-muted/30 transition-colors no-underline"
      onClick={(e) => e.stopPropagation()}
    >
      {preview.image && (
        <img
          src={preview.image}
          alt={preview.title || ""}
          className="w-full max-h-[200px] object-cover"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      )}
      <div className="p-2.5">
        {preview.siteName && (
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">{preview.siteName}</p>
        )}
        {preview.title && (
          <p className="text-sm font-medium leading-tight line-clamp-2 text-foreground">{preview.title}</p>
        )}
        {preview.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{preview.description}</p>
        )}
        <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
          <ExternalLink className="h-3 w-3" />
          <span className="truncate">{new URL(url).hostname}</span>
        </div>
      </div>
    </a>
  );
});

LinkPreviewCard.displayName = "LinkPreviewCard";

export function MessageLinkPreviews({ text }: { text: string }) {
  const urls = extractUrls(text);
  if (!urls.length) return null;

  // Show preview for first URL only to avoid clutter
  return <LinkPreviewCard url={urls[0]} />;
}

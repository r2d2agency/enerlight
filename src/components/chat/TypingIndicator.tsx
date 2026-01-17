import { cn } from "@/lib/utils";

interface TypingIndicatorProps {
  contactName?: string | null;
  className?: string;
}

export function TypingIndicator({ contactName, className }: TypingIndicatorProps) {
  return (
    <div className={cn("flex items-center gap-2 text-muted-foreground", className)}>
      <div className="flex items-center gap-1">
        <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
      <span className="text-xs">
        {contactName || 'Contato'} está digitando...
      </span>
    </div>
  );
}

import { useState, useRef, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { resolveMediaUrl } from "@/lib/media";
import { safeFormatDate } from "@/lib/utils";
import {
  FileText, Download, Edit2, MapPin, Tag, LogIn, LogOut, Image as ImageIcon, Printer,
} from "lucide-react";
import { FieldCapture, FieldCaptureDetail } from "@/hooks/use-captador";

interface PhotoBookDialogProps {
  open: boolean;
  onClose: () => void;
  captures: FieldCapture[];
  periodLabel?: string;
}

interface PhotoEntry {
  url: string;
  fileName: string;
  captureId: string;
  captureName: string;
  address: string;
  segment: string;
  type: "checkin" | "checkout" | "visit" | "capture";
  date: string;
  stage: string;
  visitedBy?: string;
}

function extractPhotos(captures: FieldCapture[]): PhotoEntry[] {
  const photos: PhotoEntry[] = [];

  for (const c of captures) {
    const name = c.company_name || c.address || "Obra";
    const addr = c.address || "Sem endereço";
    const seg = c.segment || "Sem categoria";

    // Main capture attachments - these are "checkin" photos
    if (c.attachments) {
      for (const att of c.attachments) {
        if (att.file_type === "photo") {
          const resolved = resolveMediaUrl(att.file_url);
          if (resolved) {
            photos.push({
              url: resolved,
              fileName: att.file_name,
              captureId: c.id,
              captureName: name,
              address: addr,
              segment: seg,
              type: "checkin",
              date: c.created_at,
              stage: c.construction_stage || "",
            });
          }
        }
      }
    }
  }

  return photos;
}

function extractPhotosFromDetails(captures: FieldCapture[], details: Map<string, FieldCaptureDetail>): PhotoEntry[] {
  const photos: PhotoEntry[] = [];

  for (const c of captures) {
    const name = c.company_name || c.address || "Obra";
    const addr = c.address || "Sem endereço";
    const seg = c.segment || "Sem categoria";

    // Main capture attachments
    if (c.attachments) {
      for (const att of c.attachments) {
        if (att.file_type === "photo") {
          const resolved = resolveMediaUrl(att.file_url);
          if (resolved) {
            photos.push({
              url: resolved,
              fileName: att.file_name,
              captureId: c.id,
              captureName: name,
              address: addr,
              segment: seg,
              type: "checkin",
              date: c.created_at,
              stage: c.construction_stage || "",
            });
          }
        }
      }
    }

    // Visit attachments
    const detail = details.get(c.id);
    if (detail?.visits) {
      for (const visit of detail.visits) {
        if (visit.attachments) {
          for (const att of visit.attachments) {
            if (att.file_type === "photo") {
              const resolved = resolveMediaUrl(att.file_url);
              if (resolved) {
                photos.push({
                  url: resolved,
                  fileName: att.file_name,
                  captureId: c.id,
                  captureName: name,
                  address: addr,
                  segment: seg,
                  type: "visit",
                  date: visit.created_at,
                  stage: visit.construction_stage || "",
                  visitedBy: visit.visited_by_name,
                });
              }
            }
          }
        }
      }
    }
  }

  return photos;
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of items) {
    const key = keyFn(item);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return groups;
}

function PhotoGrid({ photos, showLabels = true }: { photos: PhotoEntry[]; showLabels?: boolean }) {
  const [failedUrls, setFailedUrls] = useState<Set<string>>(new Set());

  if (photos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <ImageIcon className="h-10 w-10 mb-2 opacity-40" />
        <p className="text-sm">Nenhuma foto neste grupo</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 print:grid-cols-3 print:gap-2">
      {photos.filter(p => !failedUrls.has(p.url)).map((photo, idx) => (
        <div key={`${photo.captureId}-${idx}`} className="group relative rounded-lg overflow-hidden border bg-muted aspect-square">
          <img
            src={photo.url}
            alt={photo.fileName || "Foto"}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setFailedUrls(prev => new Set(prev).add(photo.url))}
          />
          {showLabels && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2 print:bg-black/50">
              <p className="text-[10px] text-white font-medium truncate">{photo.captureName}</p>
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="text-[8px] px-1 py-0 bg-white/20 text-white border-white/30 print:text-[7px]">
                  {photo.type === "checkin" ? "Check-in" : photo.type === "checkout" ? "Check-out" : "Visita"}
                </Badge>
                <span className="text-[8px] text-white/80">{safeFormatDate(photo.date, "dd/MM/yy")}</span>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SectionHeader({ icon: Icon, title, count }: { icon: any; title: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mb-3 mt-4 first:mt-0">
      <Icon className="h-4 w-4 text-primary" />
      <h3 className="font-semibold text-sm">{title}</h3>
      <Badge variant="secondary" className="text-xs">{count} fotos</Badge>
    </div>
  );
}

export function PhotoBookDialog({ open, onClose, captures, periodLabel }: PhotoBookDialogProps) {
  const [title, setTitle] = useState("Book de Fotos");
  const [description, setDescription] = useState("");
  const [closingPhrase, setClosingPhrase] = useState("Relatório gerado automaticamente pelo sistema Captador.");
  const [editMode, setEditMode] = useState(false);
  const [viewTab, setViewTab] = useState("rota");
  const printRef = useRef<HTMLDivElement>(null);

  const photos = useMemo(() => extractPhotos(captures), [captures]);

  const totalColetas = captures.length;

  const byRoute = useMemo(() => groupBy(photos, p => p.address), [photos]);
  const byCategory = useMemo(() => groupBy(photos, p => p.segment), [photos]);
  const byType = useMemo(() => {
    const checkinPhotos = photos.filter(p => p.type === "checkin");
    const checkoutPhotos = photos.filter(p => p.type === "checkout");
    const visitPhotos = photos.filter(p => p.type === "visit");
    return { checkinPhotos, checkoutPhotos, visitPhotos };
  }, [photos]);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', system-ui, sans-serif; color: #1a1a1a; padding: 20px; }
          .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #e5e7eb; }
          .header h1 { font-size: 24px; font-weight: 700; margin-bottom: 8px; }
          .header .subtitle { font-size: 14px; color: #6b7280; }
          .header .stats { display: flex; justify-content: center; gap: 24px; margin-top: 12px; }
          .header .stat { text-align: center; }
          .header .stat-value { font-size: 20px; font-weight: 700; color: #2563eb; }
          .header .stat-label { font-size: 11px; color: #9ca3af; }
          .section { margin-bottom: 24px; page-break-inside: avoid; }
          .section-title { font-size: 16px; font-weight: 600; margin-bottom: 12px; padding: 6px 12px; background: #f3f4f6; border-radius: 6px; display: flex; align-items: center; gap: 8px; }
          .section-count { font-size: 12px; color: #6b7280; font-weight: 400; }
          .photo-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
          .photo-item { position: relative; aspect-ratio: 1; border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb; }
          .photo-item img { width: 100%; height: 100%; object-fit: cover; }
          .photo-label { position: absolute; bottom: 0; left: 0; right: 0; padding: 4px 6px; background: rgba(0,0,0,0.6); }
          .photo-label p { font-size: 9px; color: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .footer { margin-top: 40px; padding-top: 20px; border-top: 2px solid #e5e7eb; text-align: center; }
          .footer p { font-size: 13px; color: #6b7280; font-style: italic; }
          .footer .date { font-size: 11px; color: #9ca3af; margin-top: 8px; }
          @media print {
            body { padding: 10px; }
            .section { page-break-inside: avoid; }
            .photo-grid { grid-template-columns: repeat(3, 1fr); gap: 6px; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${title}</h1>
          ${description ? `<p class="subtitle">${description}</p>` : ''}
          <div class="stats">
            <div class="stat"><div class="stat-value">${totalColetas}</div><div class="stat-label">Total de Coletas</div></div>
            <div class="stat"><div class="stat-value">${photos.length}</div><div class="stat-label">Total de Fotos</div></div>
            <div class="stat"><div class="stat-value">${Object.keys(byRoute).length}</div><div class="stat-label">Rotas</div></div>
            <div class="stat"><div class="stat-value">${Object.keys(byCategory).length}</div><div class="stat-label">Categorias</div></div>
          </div>
          ${periodLabel ? `<p class="subtitle" style="margin-top:8px">Período: ${periodLabel}</p>` : ''}
        </div>
        ${generateSections()}
        <div class="footer">
          <p>${closingPhrase}</p>
          <p class="date">Gerado em ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
        </div>
      </body>
      </html>
    `);

    printWindow.document.close();

    // Wait for images to load before printing
    const images = printWindow.document.querySelectorAll("img");
    let loaded = 0;
    const total = images.length;

    if (total === 0) {
      setTimeout(() => { printWindow.print(); }, 300);
      return;
    }

    const checkDone = () => {
      loaded++;
      if (loaded >= total) {
        setTimeout(() => { printWindow.print(); }, 500);
      }
    };

    images.forEach(img => {
      if (img.complete) { checkDone(); }
      else {
        img.onload = checkDone;
        img.onerror = checkDone;
      }
    });
  };

  function generateSections(): string {
    let html = "";

    // By Route
    html += '<h2 style="font-size:18px;font-weight:700;margin:20px 0 12px;border-bottom:1px solid #e5e7eb;padding-bottom:6px;">📍 Por Rota / Endereço</h2>';
    for (const [route, routePhotos] of Object.entries(byRoute)) {
      html += `<div class="section">
        <div class="section-title">📍 ${route} <span class="section-count">(${routePhotos.length} fotos)</span></div>
        <div class="photo-grid">
          ${routePhotos.map(p => `
            <div class="photo-item">
              <img src="${p.url}" alt="${p.fileName}" crossorigin="anonymous" />
              <div class="photo-label"><p>${p.captureName} • ${safeFormatDate(p.date, "dd/MM/yy")}</p></div>
            </div>
          `).join("")}
        </div>
      </div>`;
    }

    // By Category
    html += '<h2 style="font-size:18px;font-weight:700;margin:20px 0 12px;border-bottom:1px solid #e5e7eb;padding-bottom:6px;">🏷️ Por Categoria</h2>';
    for (const [cat, catPhotos] of Object.entries(byCategory)) {
      html += `<div class="section">
        <div class="section-title">🏷️ ${cat} <span class="section-count">(${catPhotos.length} fotos)</span></div>
        <div class="photo-grid">
          ${catPhotos.map(p => `
            <div class="photo-item">
              <img src="${p.url}" alt="${p.fileName}" crossorigin="anonymous" />
              <div class="photo-label"><p>${p.captureName} • ${p.address}</p></div>
            </div>
          `).join("")}
        </div>
      </div>`;
    }

    // Check-in / Check-out / Visits
    html += '<h2 style="font-size:18px;font-weight:700;margin:20px 0 12px;border-bottom:1px solid #e5e7eb;padding-bottom:6px;">📋 Por Tipo</h2>';
    if (byType.checkinPhotos.length > 0) {
      html += `<div class="section">
        <div class="section-title">✅ Check-in <span class="section-count">(${byType.checkinPhotos.length} fotos)</span></div>
        <div class="photo-grid">
          ${byType.checkinPhotos.map(p => `
            <div class="photo-item">
              <img src="${p.url}" alt="${p.fileName}" crossorigin="anonymous" />
              <div class="photo-label"><p>${p.captureName} • ${safeFormatDate(p.date, "dd/MM/yy")}</p></div>
            </div>
          `).join("")}
        </div>
      </div>`;
    }
    if (byType.visitPhotos.length > 0) {
      html += `<div class="section">
        <div class="section-title">🔄 Visitas <span class="section-count">(${byType.visitPhotos.length} fotos)</span></div>
        <div class="photo-grid">
          ${byType.visitPhotos.map(p => `
            <div class="photo-item">
              <img src="${p.url}" alt="${p.fileName}" crossorigin="anonymous" />
              <div class="photo-label"><p>${p.captureName} • ${p.visitedBy || ""} • ${safeFormatDate(p.date, "dd/MM/yy")}</p></div>
            </div>
          `).join("")}
        </div>
      </div>`;
    }

    return html;
  }

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Book de Fotos
          </DialogTitle>
        </DialogHeader>

        {/* Editable Header */}
        <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              {editMode ? (
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="text-lg font-bold h-10"
                  placeholder="Título do Book"
                />
              ) : (
                <h2 className="text-lg font-bold">{title}</h2>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={() => setEditMode(!editMode)}>
              <Edit2 className="h-4 w-4" />
            </Button>
          </div>

          {editMode && (
            <>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descrição do book (opcional)..."
                rows={2}
              />
              <Textarea
                value={closingPhrase}
                onChange={(e) => setClosingPhrase(e.target.value)}
                placeholder="Frase de encerramento..."
                rows={2}
              />
            </>
          )}

          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Total de Coletas:</span>
              <span className="font-bold text-primary">{totalColetas}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Fotos:</span>
              <span className="font-bold">{photos.length}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Rotas:</span>
              <span className="font-bold">{Object.keys(byRoute).length}</span>
            </div>
            {periodLabel && (
              <Badge variant="outline" className="text-xs">{periodLabel}</Badge>
            )}
          </div>
        </div>

        {/* Tabs for different groupings */}
        <Tabs value={viewTab} onValueChange={setViewTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-full">
            <TabsTrigger value="rota" className="flex-1"><MapPin className="h-3.5 w-3.5 mr-1" /> Rotas</TabsTrigger>
            <TabsTrigger value="categoria" className="flex-1"><Tag className="h-3.5 w-3.5 mr-1" /> Categorias</TabsTrigger>
            <TabsTrigger value="checkin" className="flex-1"><LogIn className="h-3.5 w-3.5 mr-1" /> Check-in/out</TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 pr-3 mt-3">
            <div ref={printRef}>
              <TabsContent value="rota" className="mt-0">
                {Object.entries(byRoute).map(([route, routePhotos]) => (
                  <div key={route} className="mb-6">
                    <SectionHeader icon={MapPin} title={route} count={routePhotos.length} />
                    <PhotoGrid photos={routePhotos} />
                  </div>
                ))}
                {Object.keys(byRoute).length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>Nenhuma foto encontrada no período selecionado</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="categoria" className="mt-0">
                {Object.entries(byCategory).map(([cat, catPhotos]) => (
                  <div key={cat} className="mb-6">
                    <SectionHeader icon={Tag} title={cat} count={catPhotos.length} />
                    <PhotoGrid photos={catPhotos} />
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="checkin" className="mt-0">
                {byType.checkinPhotos.length > 0 && (
                  <div className="mb-6">
                    <SectionHeader icon={LogIn} title="Check-in" count={byType.checkinPhotos.length} />
                    <PhotoGrid photos={byType.checkinPhotos} />
                  </div>
                )}
                {byType.checkoutPhotos.length > 0 && (
                  <div className="mb-6">
                    <SectionHeader icon={LogOut} title="Check-out" count={byType.checkoutPhotos.length} />
                    <PhotoGrid photos={byType.checkoutPhotos} />
                  </div>
                )}
                {byType.visitPhotos.length > 0 && (
                  <div className="mb-6">
                    <SectionHeader icon={MapPin} title="Visitas" count={byType.visitPhotos.length} />
                    <PhotoGrid photos={byType.visitPhotos} />
                  </div>
                )}
              </TabsContent>
            </div>

            {/* Closing phrase preview */}
            {closingPhrase && (
              <Card className="p-4 mt-4 text-center bg-muted/30 print:mt-8">
                <p className="text-sm text-muted-foreground italic">{closingPhrase}</p>
                <p className="text-[10px] text-muted-foreground mt-2">
                  Gerado em {new Date().toLocaleDateString("pt-BR")}
                </p>
              </Card>
            )}
          </ScrollArea>
        </Tabs>

        {/* Actions */}
        <div className="flex justify-end gap-2 border-t pt-3">
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          <Button onClick={handlePrint} className="gap-2">
            <Printer className="h-4 w-4" /> Gerar PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

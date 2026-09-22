import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const loadRemoteImage = (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = url;
  });
};

const generateModernPortraitPDF = async (quote: any, organization: any) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const coverUrl = quote.template?.cover_url || quote.template_cover || quote.cover_image_url;
  if (coverUrl) {
    try {
      const image = await loadRemoteImage(coverUrl);
      doc.addImage(image, 'PNG', 0, 0, pageWidth, pageHeight);
      doc.addPage();
    } catch (_) { /* continue without cover */ }
  }
  doc.setFillColor(32, 45, 61); doc.rect(0, 0, pageWidth, 38, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.text('PROPOSTA', margin, 18);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(`CÓDIGO ${String(quote.id || '').split('-')[0].toUpperCase()}`, margin, 27);
  doc.text(format(new Date(), 'dd/MM/yyyy'), pageWidth - margin, 27, { align: 'right' });
  if (organization?.logo_url) { try { const logo = await loadRemoteImage(organization.logo_url); doc.addImage(logo, 'PNG', pageWidth - 45, 6, 25, 20, undefined, 'FAST'); } catch (_) {} }
  let y = 50;
  doc.setTextColor(32, 45, 61); doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('CLIENTE', margin, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); y += 7; doc.text(quote.client_name || 'Não informado', margin, y);
  const clientExtra = [quote.client_document, quote.client_email, quote.client_phone].filter(Boolean).join(' · ');
  if (clientExtra) { y += 5; doc.setTextColor(90, 100, 110); doc.setFontSize(8); doc.text(clientExtra, margin, y); }
  y += 13; doc.setTextColor(32, 45, 61); doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('CONDIÇÕES COMERCIAIS', margin, y);
  y += 7; doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(70, 80, 90);
  const conditions = [`Pagamento: ${quote.payment_terms || 'A definir'}`, `Frete: ${(quote.shipping_type || 'cif').toUpperCase()} · ${currency.format(Number(quote.shipping_value || 0))}`, `Validade: ${quote.valid_until ? format(parseISO(quote.valid_until), 'dd/MM/yyyy') : 'A definir'}`];
  doc.text(conditions, margin, y, { lineHeightFactor: 1.5 }); y += conditions.length * 5 + 7;
  doc.setTextColor(32, 45, 61);
  autoTable(doc, { startY: y, margin: { left: margin, right: margin }, head: [['Produto', 'Qtd', 'Unitário', 'Desc.', 'Total']], body: (quote.items || []).map((item: any) => [item.product_name || 'Produto', item.quantity || 0, currency.format(item.unit_price || 0), `${Number(item.discount_value || item.discount_percent || 0).toFixed(2)}%`, currency.format(item.total_price || 0)]), theme: 'striped', headStyles: { fillColor: [32, 45, 61], textColor: 255, fontSize: 8 }, bodyStyles: { fontSize: 8, cellPadding: 3 }, columnStyles: { 0: { cellWidth: 67 }, 1: { halign: 'center', cellWidth: 18 }, 2: { halign: 'right', cellWidth: 31 }, 3: { halign: 'right', cellWidth: 22 }, 4: { halign: 'right', cellWidth: 35 } }, foot: [[{ content: 'TOTAL', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold', fillColor: [230, 235, 240] } }, { content: currency.format(Number(quote.total_value || 0)), styles: { halign: 'right', fontStyle: 'bold', fillColor: [32, 45, 61], textColor: 255 } }]], showHead: 'everyPage' });
  y = (doc as any).lastAutoTable.finalY + 12;
  const notes = [quote.notes, quote.fiscal_info || quote.template_fiscal_info].filter(Boolean).join('\n');
  if (notes) { doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.text('OBSERVAÇÕES', margin, y); y += 6; doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 90, 100); doc.text(doc.splitTextToSize(String(notes).replace(/<[^>]*>/g, ''), pageWidth - margin * 2), margin, y); }
  for (let page = 1; page <= doc.getNumberOfPages(); page += 1) { doc.setPage(page); doc.setDrawColor(210, 215, 220); doc.line(margin, pageHeight - 14, pageWidth - margin, pageHeight - 14); doc.setFontSize(7); doc.setTextColor(120, 130, 140); doc.text(String(quote.template_footer || quote.footer_text || organization?.name || ''), pageWidth / 2, pageHeight - 8, { align: 'center' }); }
  const fileName = (quote.client_name || 'proposta').replace(/\s+/g, '-').toLowerCase(); doc.save(`proposta-${fileName}-vertical.pdf`);
};

export const generateQuotePDF = async (quote: any, organization: any, options: { layout?: 'classic-landscape' | 'modern-portrait' } = {}) => {
  if (!quote) {
    console.error("No quote data provided to generateQuotePDF");
    return;
  }
  if (options.layout === 'modern-portrait' || quote.pdf_layout === 'modern-portrait' || quote.template?.pdf_layout === 'modern-portrait') {
    await generateModernPortraitPDF(quote, organization);
    return;
  }

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4"
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // 1. Cover Page (Folha de Rosto) - Full Page
  const coverUrl = quote.template?.cover_url || quote.template_cover || quote.cover_image_url;
  if (coverUrl) {
    try {
      const imgData = await loadRemoteImage(coverUrl);
      doc.addImage(imgData, 'JPEG', 0, 0, pageWidth, pageHeight);
      doc.addPage();
    } catch (e) {
      console.error("Failed to add cover image", e);
      // Don't stop the whole PDF generation if just the cover fails
    }
  }

  // 2. Header
  doc.setFontSize(22);
  doc.setTextColor(40, 40, 40);
  doc.text("PROPOSTA", 14, 22);
  
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`CÓDIGO: ${quote.id.split('-')[0].toUpperCase()}`, 14, 30);
  doc.text(`DATA: ${format(new Date(), 'dd/MM/yyyy')}`, 14, 35);
  if (quote.valid_until) {
    doc.text(`VALIDADE: ${format(parseISO(quote.valid_until), 'dd/MM/yyyy')}`, 14, 40);
  }

  // 3. Organization info (Sender)
  if (organization?.logo_url) {
     try {
        const logo = await loadRemoteImage(organization.logo_url);
        // Usar proporção da imagem ou valores fixos para evitar caixa preta/distorção
        doc.addImage(logo, 'PNG', pageWidth - 44, 10, 30, 30, undefined, 'FAST');
      } catch(e) {}
  }
  
  doc.setFontSize(12);
  doc.setTextColor(40, 40, 40);
  doc.text(organization?.name || "Empresa", pageWidth - 14, 50, { align: "right" });

  // 4. Client Info
  doc.setDrawColor(220, 220, 220);
  doc.line(14, 55, pageWidth - 14, 55);
  
  doc.setFontSize(11);
  doc.text("DESTINATÁRIO:", 14, 65);
  doc.setFont("helvetica", "bold");
  doc.text(quote.client_name, 14, 72);
  doc.setFont("helvetica", "normal");
  
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  let clientY = 78;
  if (quote.client_document) {
    doc.text(`CPF/CNPJ: ${quote.client_document}`, 14, clientY);
    clientY += 6;
  }
  if (quote.client_email) {
    doc.text(`E-mail: ${quote.client_email}`, 14, clientY);
    clientY += 6;
  }
  if (quote.client_phone) {
    doc.text(`WhatsApp: ${quote.client_phone}`, 14, clientY);
    clientY += 6;
  }

  // 4.1 Payment Info
  doc.setFontSize(10);
  doc.setTextColor(40, 40, 40);
  doc.setFont("helvetica", "bold");
  doc.text("FORMA DE PAGAMENTO:", pageWidth / 2, 65);
  doc.setFont("helvetica", "normal");
  doc.text(quote.payment_method?.toUpperCase() || "N/A", pageWidth / 2, 72);
  
  doc.setFont("helvetica", "bold");
  doc.text("PRAZO DE PAGAMENTO:", pageWidth / 2, 78);
  doc.setFont("helvetica", "normal");
  doc.text(quote.payment_terms?.toUpperCase() || "N/A", pageWidth / 2, 85);

  // 4.2 Shipping Info
  doc.setFont("helvetica", "bold");
  doc.text("FRETE:", pageWidth - 14, 65, { align: "right" });
  doc.setFont("helvetica", "normal");
  const shippingType = quote.shipping_type === 'cif' ? 'CIF (Remetente)' : quote.shipping_type === 'fob' ? 'FOB (Destinatário)' : 'N/A';
  doc.text(shippingType, pageWidth - 14, 72, { align: "right" });
  
  if (quote.shipping_value > 0) {
    doc.setFont("helvetica", "bold");
    doc.text("VALOR DO FRETE:", pageWidth - 14, 78, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.text(new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(quote.shipping_value), pageWidth - 14, 85, { align: "right" });
  }


  // 5. Items Table
  // Reserve image space only when the proposal explicitly requests images and at least one item has one.
  const includeImages = quote.include_images === true && Boolean(quote.items?.some((item: any) => item.image_url));
  
  const headers = includeImages 
    ? [['Foto', 'Produto', 'Qtd', 'Unitário', 'Desc.', 'Total']]
    : [['Produto', 'Qtd', 'Unitário', 'Desc.', 'Total']];

  const tableData = quote.items?.map((item: any) => {
    const discountStr = item.discount_type === 'percentage' 
      ? `${item.discount_value || item.discount || 0}%`
      : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.discount_value || item.discount || 0);

    const row = [
      item.product_name || 'Produto sem nome',
      item.quantity || 0,
      new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.unit_price || 0),
      discountStr,
      new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.total_price || 0)
    ];
    
    if (includeImages) {
      return ['', ...row];
    }
    return row;
  }) || [];

  autoTable(doc, {
    startY: 100,
    head: headers,
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: includeImages ? {
      0: { cellWidth: 25, minCellHeight: 25 },
      2: { halign: 'center' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
    } : {
      1: { halign: 'center' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
    },
    didDrawCell: (data) => {
      if (includeImages && data.section === 'body' && data.column.index === 0) {
        const item = quote.items?.[data.row.index];
        if (item?.image_url) {
          try {
            // Since we can't easily await inside didDrawCell, we should have pre-loaded 
            // but for now, we'll try to use the image if it's already cached or a URL
            // and wrap in try-catch to prevent PDF generation crash
            const dim = 18;
            const x = data.cell.x + (data.cell.width - dim) / 2;
            const y = data.cell.y + (data.cell.height - dim) / 2;
            doc.addImage(item.image_url, 'JPEG', x, y, dim, dim);
          } catch (e) {
            console.warn("Could not add image to PDF row", e);
          }
        }
      }
    },
    foot: [
      [
        { content: 'SUBTOTAL ITENS', colSpan: includeImages ? 5 : 4, styles: { halign: 'right', fontStyle: 'bold' as const, fillColor: [245, 245, 245], textColor: [40, 40, 40] } },
        { content: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(quote.items?.reduce((acc: number, item: any) => acc + (item.total_price || 0), 0) || 0), styles: { fontStyle: 'bold' as const, fillColor: [245, 245, 245], halign: 'right', textColor: [40, 40, 40] } }
      ],
      ...(quote.shipping_value > 0 ? [[
        { content: `FRETE (${quote.shipping_type?.toUpperCase() || 'CIF'})`, colSpan: includeImages ? 5 : 4, styles: { halign: 'right', fontStyle: 'bold' as const, fillColor: [245, 245, 245], textColor: [40, 40, 40] } },
        { content: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(quote.shipping_value), styles: { fontStyle: 'bold' as const, fillColor: [245, 245, 245], halign: 'right', textColor: [40, 40, 40] } }
      ]] : []),
      [
        { content: 'VALOR TOTAL', colSpan: includeImages ? 5 : 4, styles: { halign: 'right', fontStyle: 'bold' as const, fillColor: [40, 40, 40], textColor: [255, 255, 255] } },
        { content: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(quote.total_value || 0), styles: { fontStyle: 'bold' as const, fillColor: [40, 40, 40], halign: 'right', textColor: [255, 255, 255] } }
      ]
    ] as any,
  });

  // 6. Footer & Notes
  let currentY = (doc as any).lastAutoTable.finalY + 15;

  // 6.1 Fiscal Information (from quote, fallback to template)
  const fiscalSource = quote.fiscal_info || quote.template_fiscal_info;
  if (fiscalSource) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(40, 40, 40);
    doc.text("Informações Fiscais:", 14, currentY);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    
    const cleanFiscal = String(fiscalSource)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim();
      
    const splitFiscal = doc.splitTextToSize(cleanFiscal, pageWidth - 28);
    doc.text(splitFiscal, 14, currentY + 7, { align: "left" });
    
    currentY += (splitFiscal.length * 5) + 12;
  }

  // Check if we need a new page for notes if they won't fit
  if (currentY > pageHeight - 30) {
    doc.addPage();
    currentY = 20;
  }

  // 6.2 Internal Quote Notes
  if (quote.notes) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(40, 40, 40);
    doc.text("Informações Adicionais / Observações:", 14, currentY);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    
    const cleanNotes = String(quote.notes).replace(/<[^>]*>/g, '');
    const splitNotes = doc.splitTextToSize(cleanNotes, pageWidth - 28);
    doc.text(splitNotes, 14, currentY + 7, { align: "left" });
    currentY += (splitNotes.length * 5) + 12;
  }

  // Check again for template header text (which the user wants below products now)
  if (currentY > pageHeight - 30) {
    doc.addPage();
    currentY = 20;
  }

  const templateText = quote.template?.header_text || '';
  if (templateText) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(40, 40, 40);
    doc.text("Termos e Condições do Modelo:", 14, currentY);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    
    const cleanTemplateText = String(templateText)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim();
      
    const splitTemplateText = doc.splitTextToSize(cleanTemplateText, pageWidth - 28);
    doc.text(splitTemplateText, 14, currentY + 7, { align: "left" });
    currentY += (splitTemplateText.length * 5) + 12;
  }
  // 7. Global 3-Column Footer
  const footerConfig = quote.template?.footer_config || quote.footer_config;
  if (footerConfig) {
    let config;
    try {
      config = typeof footerConfig === 'string' ? JSON.parse(footerConfig) : footerConfig;
    } catch (e) {
      console.error("Failed to parse footer config", e);
      config = null;
    }

    if (config) {
      const colWidth = (pageWidth - 28) / 3;
      const footerY = pageHeight - 15;
      
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      
      const cols = ['left', 'center', 'right'];
      for (let i = 0; i < cols.length; i++) {
        const col = cols[i] as 'left' | 'center' | 'right';
        const x = 14 + (i * colWidth) + (colWidth / 2);
        const conf = config[col];
        
        if (conf?.type === 'text' && conf.content) {
          doc.text(conf.content, x, footerY, { align: "center" });
        } else if (conf?.type === 'logo' && conf.content) {
          try {
            const logoData = await loadRemoteImage(conf.content);
            doc.addImage(logoData, 'PNG', x - 10, footerY - 8, 20, 10, undefined, 'FAST');
          } catch(e) {}
        } else if (conf?.type === 'social' && config.social) {
          const social = config.social;
          const lines = [];
          if (social.website) lines.push(social.website);
          if (social.instagram) lines.push(`IG: ${social.instagram}`);
          if (social.phone) lines.push(`Tel: ${social.phone}`);
          
          if (lines.length > 0) {
            doc.text(lines.join(' | '), x, footerY, { align: "center" });
          }
        }
      }
    }
  } else if (quote.template_footer || quote.footer_text) {
    const footerText = quote.template_footer || quote.footer_text;
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    const cleanFooter = String(footerText).replace(/<[^>]*>/g, '');
    const splitFooter = doc.splitTextToSize(cleanFooter, pageWidth - 28);
    doc.text(splitFooter, pageWidth / 2, pageHeight - 15, { align: "center" });
  }

  const fileName = (quote.client_name || 'proposta').replace(/\s+/g, '-').toLowerCase();
  doc.save(`proposta-${fileName}.pdf`);
};
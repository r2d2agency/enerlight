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
      resolve(canvas.toDataURL("image/jpeg"));
    };
    img.onerror = reject;
    img.src = url;
  });
};

export const generateQuotePDF = async (quote: any, organization: any) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // 1. Cover Page (Folha de Rosto)
  const coverUrl = quote.template_cover || quote.cover_image_url;
  if (coverUrl) {
    try {
      const imgData = await loadRemoteImage(coverUrl);
      doc.addImage(imgData, 'JPEG', 0, 0, pageWidth, pageHeight);
      doc.addPage();
    } catch (e) {
      console.error("Failed to add cover image", e);
    }
  }

  // 2. Header
  doc.setFontSize(22);
  doc.setTextColor(40, 40, 40);
  doc.text("ORÇAMENTO", 14, 22);
  
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
       doc.addImage(logo, 'PNG', pageWidth - 44, 15, 30, 30);
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
  }

  // 5. Items Table
  const includeImages = quote.include_images !== false;
  
  const headers = includeImages 
    ? [['Foto', 'Produto', 'Qtd', 'Unitário', 'Total']]
    : [['Produto', 'Qtd', 'Unitário', 'Total']];

  const tableData = quote.items.map((item: any) => {
    const row = [
      item.product_name,
      item.quantity,
      new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.unit_price),
      new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.total_price)
    ];
    
    if (includeImages) {
      return ['', ...row];
    }
    return row;
  });

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
    } : {
      1: { halign: 'center' },
      2: { halign: 'right' },
      3: { halign: 'right' },
    },
    didDrawCell: (data) => {
      if (includeImages && data.section === 'body' && data.column.index === 0) {
        const item = quote.items[data.row.index];
        if (item.image_url) {
          try {
            const dim = 18;
            const x = data.cell.x + (data.cell.width - dim) / 2;
            const y = data.cell.y + (data.cell.height - dim) / 2;
            doc.addImage(item.image_url, 'JPEG', x, y, dim, dim);
          } catch (e) {
            console.error("Error adding image to PDF table", e);
          }
        }
      }
    },
    foot: [[
      { content: 'VALOR TOTAL', colSpan: includeImages ? 4 : 3, styles: { halign: 'right', fontStyle: 'bold', fillColor: [245, 245, 245] } },
      { content: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(quote.total_value), styles: { fontStyle: 'bold', fillColor: [245, 245, 245], halign: 'right' } }
    ]]
  });

  // 6. Footer & Notes
  const finalY = (doc as any).lastAutoTable.finalY + 15;
  if (quote.notes || quote.template_header) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(40, 40, 40);
    doc.text("Informações Adicionais:", 14, finalY);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    
    const combinedText = [quote.template_header, quote.notes].filter(Boolean).join('\n\n');
    const cleanText = combinedText.replace(/<[^>]*>/g, '');
    const splitNotes = doc.splitTextToSize(cleanText, pageWidth - 28);
    doc.text(splitNotes, 14, finalY + 7);
  }

  // Global Footer (from Template or Quote)
  const footerText = quote.template_footer || quote.footer_text;
  if (footerText) {
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    // Remove HTML tags for PDF text positioning
    const cleanFooter = footerText.replace(/<[^>]*>/g, '');
    const splitFooter = doc.splitTextToSize(cleanFooter, pageWidth - 28);
    doc.text(splitFooter, pageWidth / 2, pageHeight - 15, { align: "center" });
  }

  doc.save(`orcamento-${quote.client_name.replace(/\s+/g, '-').toLowerCase()}.pdf`);
};

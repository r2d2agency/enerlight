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

export const generateQuotePDF = async (quote: any, organization: any) => {
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
  const includeImages = quote.include_images !== false;
  
  const headers = includeImages 
    ? [['Foto', 'Produto', 'Qtd', 'Unitário', 'Desc.', 'Total']]
    : [['Produto', 'Qtd', 'Unitário', 'Desc.', 'Total']];

  const tableData = quote.items.map((item: any) => {
    const discountStr = item.discount_type === 'percentage' 
      ? `${item.discount_value || item.discount || 0}%`
      : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.discount_value || item.discount || 0);

    const row = [
      item.product_name,
      item.quantity,
      new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.unit_price),
      discountStr,
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
      5: { halign: 'right' },
    } : {
      1: { halign: 'center' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
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
    foot: [
      [
        { content: 'SUBTOTAL ITENS', colSpan: includeImages ? 5 : 4, styles: { halign: 'right', fontStyle: 'bold', fillColor: [245, 245, 245], textColor: [40, 40, 40] } },
        { content: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(quote.items.reduce((acc: number, item: any) => acc + (item.total_price || 0), 0)), styles: { fontStyle: 'bold', fillColor: [245, 245, 245], halign: 'right', textColor: [40, 40, 40] } }
      ],
      quote.shipping_value > 0 ? [
        { content: `FRETE (${quote.shipping_type?.toUpperCase() || 'CIF'})`, colSpan: includeImages ? 5 : 4, styles: { halign: 'right', fontStyle: 'bold', fillColor: [245, 245, 245], textColor: [40, 40, 40] } },
        { content: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(quote.shipping_value), styles: { fontStyle: 'bold', fillColor: [245, 245, 245], halign: 'right', textColor: [40, 40, 40] } }
      ] : [],
      [
        { content: 'VALOR TOTAL', colSpan: includeImages ? 5 : 4, styles: { halign: 'right', fontStyle: 'bold', fillColor: [40, 40, 40], textColor: [255, 255, 255] } },
        { content: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(quote.total_value), styles: { fontStyle: 'bold', fillColor: [40, 40, 40], halign: 'right', textColor: [255, 255, 255] } }
      ]
    ].filter(row => row.length > 0)
  });
  });

  // 6. Footer & Notes
  const finalY = (doc as any).lastAutoTable.finalY + 15;
  const notesText = quote.notes || quote.template?.header_text || '';
  if (notesText) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(40, 40, 40);
    doc.text("Informações Adicionais / Observações:", 14, finalY);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    
    const cleanText = notesText.replace(/<[^>]*>/g, '');
    const splitNotes = doc.splitTextToSize(cleanText, pageWidth - 28);
    doc.text(splitNotes, 14, finalY + 7, { align: "left" });
  }

  // 7. Global 3-Column Footer
  const footerConfig = quote.template?.footer_config || quote.footer_config;
  if (footerConfig) {
    const config = typeof footerConfig === 'string' ? JSON.parse(footerConfig) : footerConfig;
    const colWidth = (pageWidth - 28) / 3;
    const footerY = pageHeight - 15;
    
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    
    const cols = ['left', 'center', 'right'];
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i];
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
        
        doc.text(lines.join(' | '), x, footerY, { align: "center" });
      }
    }
  } else if (quote.template_footer || quote.footer_text) {
    const footerText = quote.template_footer || quote.footer_text;
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    const cleanFooter = footerText.replace(/<[^>]*>/g, '');
    const splitFooter = doc.splitTextToSize(cleanFooter, pageWidth - 28);
    doc.text(splitFooter, pageWidth / 2, pageHeight - 15, { align: "center" });
  }

  doc.save(`orcamento-${quote.client_name.replace(/\s+/g, '-').toLowerCase()}.pdf`);
};
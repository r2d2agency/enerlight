import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

export const generateQuotePDF = async (quote: any, organization: any) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // 1. Cover Page (Optional)
  if (quote.cover_image_url) {
    try {
      // Logic to add cover image as full page
      // doc.addImage(quote.cover_image_url, 'JPEG', 0, 0, pageWidth, pageHeight);
      // doc.addPage();
    } catch (e) {
      console.error("Failed to add cover image", e);
    }
  }

  // 2. Header
  doc.setFontSize(20);
  doc.setTextColor(40);
  doc.text("ORÇAMENTO", 14, 22);
  
  doc.setFontSize(10);
  doc.text(`Nº: ${quote.id.split('-')[0].toUpperCase()}`, 14, 30);
  doc.text(`Data: ${format(new Date(), 'dd/MM/yyyy')}`, 14, 35);

  // 3. Organization info (Sender)
  doc.setFontSize(12);
  doc.text(organization?.name || "Empresa", pageWidth - 14, 22, { align: "right" });
  doc.setFontSize(9);
  doc.text("Gestão Comercial Online", pageWidth - 14, 28, { align: "right" });

  // 4. Client Info
  doc.line(14, 45, pageWidth - 14, 45);
  doc.setFontSize(11);
  doc.text("CLIENTE:", 14, 55);
  doc.setFont("helvetica", "bold");
  doc.text(quote.client_name, 14, 62);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  if (quote.client_document) doc.text(`CPF/CNPJ: ${quote.client_document}`, 14, 68);
  if (quote.client_email) doc.text(`E-mail: ${quote.client_email}`, 14, 74);
  if (quote.client_phone) doc.text(`WhatsApp: ${quote.client_phone}`, 14, 80);

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
      // Return a dummy value for the first column, we'll draw the image in didDrawCell
      return ['', ...row];
    }
    return row;
  });

  autoTable(doc, {
    startY: 90,
    head: headers,
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [60, 60, 60] },
    columnStyles: includeImages ? {
      0: { cellWidth: 25, minCellHeight: 25 }, // Column for image
    } : {},
    didDrawCell: (data) => {
      if (includeImages && data.section === 'body' && data.column.index === 0) {
        const item = quote.items[data.row.index];
        if (item.image_url) {
          try {
            // Draw image in the cell
            const dim = 18; // image dimension
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
      { content: 'TOTAL GERAL', colSpan: includeImages ? 4 : 3, styles: { halign: 'right', fontStyle: 'bold' } },
      { content: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(quote.total_value), styles: { fontStyle: 'bold' } }
    ]]
  });

  // 6. Footer & Notes
  const finalY = (doc as any).lastAutoTable.finalY + 15;
  if (quote.notes) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Observações:", 14, finalY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const splitNotes = doc.splitTextToSize(quote.notes, pageWidth - 28);
    doc.text(splitNotes, 14, finalY + 7);
  }

  // Global Footer
  if (quote.footer_text) {
    doc.setFontSize(8);
    doc.setTextColor(150);
    const footerText = doc.splitTextToSize(quote.footer_text, pageWidth - 28);
    doc.text(footerText, pageWidth / 2, pageHeight - 15, { align: "center" });
  }

  doc.save(`orcamento-${quote.client_name.replace(/\s+/g, '-').toLowerCase()}.pdf`);
};

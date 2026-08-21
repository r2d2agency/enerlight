import PDFDocument from 'pdfkit';
import axios from 'axios';

export async function generateQuotePDF(quoteData) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 0, size: 'A4' });
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      // 1. Cover Page
      if (quoteData.custom_cover_url) {
        try {
          const response = await axios.get(quoteData.custom_cover_url, { responseType: 'arraybuffer' });
          doc.image(response.data, 0, 0, { width: 595.28, height: 841.89 });
          doc.addPage({ margin: 50 });
        } catch (error) {
          console.error('Error loading cover image:', error);
          doc.fontSize(25).text('Orçamento', 50, 50);
          doc.addPage({ margin: 50 });
        }
      } else {
        doc.fontSize(25).text('Orçamento', 50, 50);
        doc.moveDown();
        doc.addPage({ margin: 50 });
      }

      // 2. Content Page
      doc.fontSize(18).text('Detalhamento do Orçamento', { align: 'center' });
      doc.moveDown();

      doc.fontSize(12).text(`Número: #${quoteData.id}`);
      doc.text(`Data: ${new Date(quoteData.created_at).toLocaleDateString('pt-BR')}`);
      doc.moveDown();

      // Client Info
      doc.fontSize(14).text('Cliente', { underline: true });
      doc.fontSize(12).text(`Nome: ${quoteData.customer_name || 'N/A'}`);
      doc.text(`CPF/CNPJ: ${quoteData.customer_document || 'N/A'}`);
      doc.moveDown();

      // Products Table
      doc.fontSize(14).text('Produtos', { underline: true });
      doc.moveDown(0.5);

      const items = quoteData.items || [];
      items.forEach((item, index) => {
        doc.fontSize(10).text(`${item.name} - Qtd: ${item.quantity} - Un: R$ ${Number(item.unit_price).toFixed(2)} - Total: R$ ${(item.quantity * item.unit_price).toFixed(2)}`);
      });
      doc.moveDown();

      // Summary
      doc.fontSize(12).text(`Subtotal: R$ ${Number(quoteData.subtotal || 0).toFixed(2)}`, { align: 'right' });
      doc.text(`Frete: R$ ${Number(quoteData.shipping_value || 0).toFixed(2)}`, { align: 'right' });
      if (quoteData.discount_value > 0) {
        doc.text(`Desconto: R$ ${Number(quoteData.discount_value).toFixed(2)}`, { align: 'right' });
      }
      doc.fontSize(14).text(`Total Geral: R$ ${Number(quoteData.total_value || 0).toFixed(2)}`, { align: 'right', bold: true });
      doc.moveDown();

      // Commercial Conditions
      if (quoteData.commercial_conditions) {
        doc.fontSize(12).text('Condições Comerciais:', { underline: true });
        doc.fontSize(10).text(quoteData.commercial_conditions);
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

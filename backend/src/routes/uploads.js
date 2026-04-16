import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with original extension.
    // If original filename has no extension (common on mobile), infer from mimetype
    // so providers like W-API can fetch a URL that ends with a visible extension.
    const originalExt = path.extname(file.originalname || '');
    const mime = String(file.mimetype || '').toLowerCase();

    const mimeToExt = {
      'application/pdf': '.pdf',
      'application/msword': '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'application/vnd.ms-powerpoint': '.ppt',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
      'application/vnd.openxmlformats-officedocument.presentationml.slideshow': '.ppsx',
      'application/vnd.ms-excel': '.xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
      'text/plain': '.txt',
      'text/csv': '.csv',
      'application/csv': '.csv',
      'application/zip': '.zip',
      'application/x-zip-compressed': '.zip',
      'application/x-rar-compressed': '.rar',
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'audio/mpeg': '.mp3',
      'audio/mp3': '.mp3',
      'audio/ogg': '.ogg',
      'audio/wav': '.wav',
      'audio/x-wav': '.wav',
      'audio/webm': '.webm',
      'audio/aac': '.aac',
      'audio/m4a': '.m4a',
      'audio/x-m4a': '.m4a',
      'video/mp4': '.mp4',
      'video/webm': '.webm',
      'video/ogg': '.ogv',
      'video/quicktime': '.mov',
    };

    const ext = originalExt || mimeToExt[mime] || '.bin';
    const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    cb(null, uniqueName);
  }
});

// File filter for allowed types
const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    // Images
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    // Audio
    'audio/mpeg',
    'audio/mp3',
    'audio/ogg',
    'audio/wav',
    'audio/x-wav',
    'audio/webm',
    'audio/aac',
    'audio/m4a',
    'audio/x-m4a',
    // Video
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime',
    // Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
    'application/csv',
    'application/zip',
    'application/x-rar-compressed',
    'application/x-zip-compressed',
  ];

  // Fallback extension allowlist (some browsers/mobile send generic mimetypes)
  const allowedExts = [
    // images
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.svg', '.heic', '.heif', '.ico',
    // audio
    '.mp3', '.ogg', '.wav', '.webm', '.aac', '.m4a', '.flac', '.opus', '.amr',
    // video
    '.mp4', '.webm', '.ogg', '.mov', '.qt', '.avi', '.mkv', '.wmv', '.flv', '.3gp', '.m4v',
    // documents
    '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.ppsx', '.xls', '.xlsx', '.xlsm', '.txt', '.csv', '.rtf', '.odt', '.ods', '.odp',
    // archives
    '.zip', '.rar', '.7z', '.tar', '.gz', '.tgz', '.bz2',
    // CAD / engenharia
    '.dwg', '.dxf', '.dwf', '.dwfx', '.rvt', '.rfa', '.skp', '.step', '.stp', '.iges', '.igs', '.stl', '.3ds', '.obj', '.fbx', '.dae', '.ifc', '.nwd', '.nwc', '.sat',
    // dados / dev / config
    '.json', '.xml', '.yaml', '.yml', '.md', '.log', '.html', '.htm', '.css', '.js', '.ts', '.sql',
    // outros comuns
    '.psd', '.ai', '.eps', '.indd', '.sketch', '.fig', '.kml', '.kmz', '.gpx', '.geojson',
  ];

  // Bloqueio explícito de executáveis perigosos
  const blockedExts = ['.exe', '.bat', '.cmd', '.com', '.msi', '.scr', '.vbs', '.ps1', '.sh', '.app', '.dmg', '.jar'];

  const ext = path.extname(file.originalname || '').toLowerCase();

  if (ext && blockedExts.includes(ext)) {
    cb(new Error(`Tipo de arquivo bloqueado por segurança: ${ext}`), false);
    return;
  }

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
    return;
  }

  if (ext && allowedExts.includes(ext)) {
    cb(null, true);
    return;
  }

  // Permitir mimetypes genéricos quando há extensão (mobile/desktop costuma enviar octet-stream)
  const genericMimes = ['application/octet-stream', 'application/x-binary', 'binary/octet-stream', ''];
  if (ext && genericMimes.includes(String(file.mimetype || '').toLowerCase())) {
    cb(null, true);
    return;
  }

  cb(new Error(`Tipo de arquivo não permitido: ${file.mimetype || ext || 'desconhecido'}`), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max
  }
});

// Upload single file
router.post('/', authenticate, (req, res) => {
  upload.single('file')(req, res, (err) => {
    try {
      if (err) {
        const msg = err?.message || 'Erro ao fazer upload';
        return res.status(400).json({ error: msg });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado' });
      }

      // Build the public URL - use backend domain, not frontend
      const baseUrl = process.env.API_BASE_URL || '';
      const fileUrl = `${baseUrl}/uploads/${req.file.filename}`;

      res.json({
        success: true,
        file: {
          filename: req.file.filename,
          originalName: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          url: fileUrl,
        }
      });
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ error: 'Erro ao fazer upload' });
    }
  });
});

// Public download with forced filename (keeps extension visible in the URL)
// Useful for providers that require a file extension to be present.
// Example: GET /api/uploads/public/<stored>/<downloadName.pdf>
router.get('/public/:stored/:downloadName', (req, res) => {
  try {
    const stored = String(req.params.stored || '');
    const downloadName = String(req.params.downloadName || '');

    // Prevent path traversal
    const safe = /^[a-zA-Z0-9._-]+$/;
    if (!safe.test(stored) || !safe.test(downloadName)) {
      return res.status(400).json({ error: 'Nome de arquivo inválido' });
    }

    const filePath = path.join(uploadsDir, stored);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Arquivo não encontrado' });
    }

    // Ensure downstream services see the extension in the URL
    const ext = path.extname(downloadName) || path.extname(stored);
    if (ext) {
      res.type(ext);
    }

    // Inline is usually fine; providers just need to fetch the bytes.
    // Keep a friendly filename for any human downloads.
    res.setHeader('Content-Disposition', `inline; filename="${downloadName}"`);

    return res.sendFile(filePath);
  } catch (error) {
    console.error('Public download error:', error);
    return res.status(500).json({ error: 'Erro ao baixar arquivo' });
  }
});

// Delete file
router.delete('/:filename', authenticate, (req, res) => {
  try {
    const filePath = path.join(uploadsDir, req.params.filename);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Arquivo não encontrado' });
    }
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Erro ao deletar arquivo' });
  }
});

// Check if file exists (public diagnostic endpoint)
router.get('/check/:filename', (req, res) => {
  try {
    const filePath = path.join(uploadsDir, req.params.filename);
    const exists = fs.existsSync(filePath);
    
    if (exists) {
      const stats = fs.statSync(filePath);
      const baseUrl = process.env.API_BASE_URL || '';
      res.json({ 
        exists: true, 
        size: stats.size,
        created: stats.birthtime,
        url: `${baseUrl}/uploads/${req.params.filename}`
      });
    } else {
      res.json({ exists: false, message: 'Arquivo não encontrado no servidor' });
    }
  } catch (error) {
    console.error('Check error:', error);
    res.status(500).json({ error: 'Erro ao verificar arquivo' });
  }
});

// List recent uploads (for diagnostics)
router.get('/list', authenticate, (req, res) => {
  try {
    const files = fs.readdirSync(uploadsDir)
      .map(name => {
        const filePath = path.join(uploadsDir, name);
        const stats = fs.statSync(filePath);
        return { name, size: stats.size, created: stats.birthtime };
      })
      .sort((a, b) => new Date(b.created) - new Date(a.created))
      .slice(0, 50);
    
    res.json({ files, count: files.length });
  } catch (error) {
    console.error('List error:', error);
    res.status(500).json({ error: 'Erro ao listar arquivos' });
  }
});

export default router;

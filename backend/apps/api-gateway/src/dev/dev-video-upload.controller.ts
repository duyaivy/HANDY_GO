import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Res,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { ConfigService } from '@app/config';

@ApiExcludeController()
@Controller('dev/video-upload')
export class DevVideoUploadController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  getVideoUploadTestPage(@Res() res: Response): void {
    if (this.config.isProduction) {
      throw new NotFoundException('Cannot GET /dev/video-upload');
    }

    const html = getHtmlTemplate();
    res.status(200).send(html);
  }
}

function getHtmlTemplate(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cloudinary Video Upload Tester - HANDY GO DevTools</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg-color: #0f172a;
      --card-bg: #1e293b;
      --card-border: #334155;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #6366f1;
      --primary-hover: #4f46e5;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --info: #3b82f6;
      --code-bg: #090d16;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      background-color: var(--bg-color);
      color: var(--text-main);
      min-height: 100vh;
      padding: 2rem 1rem;
      line-height: 1.5;
    }

    .container {
      max-width: 960px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 1rem;
    }

    .title-group {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    h1 {
      font-size: 1.5rem;
      font-weight: 700;
      background: linear-gradient(135deg, #a5b4fc, #6366f1);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .badge-dev {
      background-color: rgba(99, 102, 241, 0.15);
      color: #818cf8;
      border: 1px solid rgba(99, 102, 241, 0.3);
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.25rem 0.6rem;
      border-radius: 9999px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .card {
      background-color: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 0.75rem;
      padding: 1.5rem;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
    }

    .card-title {
      font-size: 1rem;
      font-weight: 600;
      color: var(--text-main);
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }

    @media (max-width: 640px) {
      .form-grid {
        grid-template-columns: 1fr;
      }
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }

    .form-group.full-width {
      grid-column: 1 / -1;
    }

    label {
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--text-muted);
    }

    input[type="text"] {
      background-color: var(--code-bg);
      border: 1px solid var(--card-border);
      border-radius: 0.5rem;
      padding: 0.6rem 0.8rem;
      color: var(--text-main);
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.85rem;
      width: 100%;
    }

    input[type="text"]:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
    }

    .dropzone {
      border: 2px dashed var(--card-border);
      border-radius: 0.75rem;
      padding: 2rem 1rem;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s ease;
      background-color: rgba(15, 23, 42, 0.4);
    }

    .dropzone:hover, .dropzone.dragover {
      border-color: var(--primary);
      background-color: rgba(99, 102, 241, 0.05);
    }

    .dropzone input[type="file"] {
      display: none;
    }

    .dropzone-icon {
      font-size: 2rem;
      margin-bottom: 0.5rem;
      color: var(--text-muted);
    }

    .file-info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 0.75rem;
      margin-top: 1rem;
      background-color: rgba(15, 23, 42, 0.6);
      padding: 1rem;
      border-radius: 0.5rem;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }

    .info-item {
      display: flex;
      flex-direction: column;
    }

    .info-label {
      font-size: 0.75rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .info-value {
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--text-main);
      word-break: break-all;
      font-family: 'JetBrains Mono', monospace;
    }

    .actions {
      display: flex;
      gap: 0.75rem;
      margin-top: 1rem;
    }

    button {
      padding: 0.65rem 1.25rem;
      border-radius: 0.5rem;
      font-weight: 600;
      font-size: 0.9rem;
      cursor: pointer;
      border: none;
      transition: all 0.15s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
    }

    .btn-primary {
      background-color: var(--primary);
      color: white;
    }

    .btn-primary:hover:not(:disabled) {
      background-color: var(--primary-hover);
      box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
    }

    .btn-secondary {
      background-color: rgba(255, 255, 255, 0.08);
      color: var(--text-main);
      border: 1px solid var(--card-border);
    }

    .btn-secondary:hover:not(:disabled) {
      background-color: rgba(255, 255, 255, 0.15);
    }

    .btn-danger {
      background-color: rgba(239, 68, 68, 0.15);
      color: #fca5a5;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }

    .btn-danger:hover:not(:disabled) {
      background-color: rgba(239, 68, 68, 0.25);
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .status-idle { background: rgba(148, 163, 184, 0.15); color: #cbd5e1; border: 1px solid rgba(148, 163, 184, 0.3); }
    .status-initializing { background: rgba(59, 130, 246, 0.15); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.3); }
    .status-uploading { background: rgba(99, 102, 241, 0.2); color: #a5b4fc; border: 1px solid rgba(99, 102, 241, 0.4); animation: pulse 2s infinite; }
    .status-retrying { background: rgba(245, 158, 11, 0.15); color: #fde047; border: 1px solid rgba(245, 158, 11, 0.3); }
    .status-completed { background: rgba(16, 185, 129, 0.15); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.3); }
    .status-failed { background: rgba(239, 68, 68, 0.15); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.3); }
    .status-cancelled { background: rgba(100, 116, 139, 0.2); color: #94a3b8; border: 1px solid rgba(100, 116, 139, 0.3); }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }

    .progress-container {
      margin-top: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .progress-bar-bg {
      background-color: var(--code-bg);
      border-radius: 9999px;
      height: 12px;
      overflow: hidden;
      border: 1px solid var(--card-border);
    }

    .progress-bar-fill {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #6366f1, #10b981);
      transition: width 0.3s ease;
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.75rem;
      margin-top: 0.75rem;
    }

    @media (max-width: 640px) {
      .metrics-grid {
        grid-template-columns: 1fr 1fr;
      }
    }

    .metric-card {
      background: rgba(15, 23, 42, 0.5);
      border: 1px solid var(--card-border);
      padding: 0.75rem;
      border-radius: 0.5rem;
      text-align: center;
    }

    .metric-val {
      font-family: 'JetBrains Mono', monospace;
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--text-main);
    }

    .metric-lbl {
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    .log-box {
      background-color: var(--code-bg);
      border: 1px solid var(--card-border);
      border-radius: 0.5rem;
      padding: 1rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
      max-height: 280px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      color: #cbd5e1;
    }

    .log-entry {
      line-height: 1.4;
      word-break: break-all;
    }

    .log-entry .time { color: #64748b; }
    .log-entry.INFO .tag { color: var(--info); font-weight: 600; }
    .log-entry.SUCCESS .tag { color: var(--success); font-weight: 600; }
    .log-entry.WARN .tag { color: var(--warning); font-weight: 600; }
    .log-entry.ERROR .tag { color: var(--danger); font-weight: 600; }

    .result-section {
      background-color: rgba(16, 185, 129, 0.05);
      border: 1px solid rgba(16, 185, 129, 0.2);
      border-radius: 0.75rem;
      padding: 1.5rem;
    }

    .secure-url-box {
      background: var(--code-bg);
      border: 1px solid var(--card-border);
      padding: 0.75rem 1rem;
      border-radius: 0.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .secure-url-link {
      color: #38bdf8;
      text-decoration: none;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.9rem;
      word-break: break-all;
    }

    .secure-url-link:hover {
      text-decoration: underline;
    }

    pre.json-viewer {
      background: var(--code-bg);
      border: 1px solid var(--card-border);
      padding: 1rem;
      border-radius: 0.5rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
      color: #a5b4fc;
      overflow-x: auto;
      max-height: 300px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="title-group">
        <h1>Cloudinary Video Upload Tester</h1>
        <span class="badge-dev">Dev Tool</span>
      </div>
      <div id="statusBadge" class="status-badge status-idle">Idle</div>
    </header>

    <!-- Configuration Card -->
    <div class="card">
      <div class="card-title">⚙️ API Gateway Configuration</div>
      <div class="form-grid">
        <div class="form-group">
          <label for="initEndpoint">Init Signature API Endpoint</label>
          <input type="text" id="initEndpoint" value="/api/v1/uploads/video/init" />
        </div>
        <div class="form-group">
          <label for="authToken">Authorization Header (JWT Token - Optional)</label>
          <input type="text" id="authToken" placeholder="Bearer eyJhbGciOi..." />
        </div>
      </div>
    </div>

    <!-- File Selection Card -->
    <div class="card">
      <div class="card-title">📹 Select Local Video File</div>
      <div class="dropzone" id="dropzone">
        <div class="dropzone-icon">📁</div>
        <div style="font-weight: 600; margin-bottom: 0.25rem;">Click to select or drag & drop a video file</div>
        <div style="font-size: 0.8rem; color: var(--text-muted);">Supports MP4, MOV, WebM (Direct chunked upload to Cloudinary)</div>
        <input type="file" id="videoFile" accept="video/*" />
      </div>

      <div class="file-info-grid" id="fileInfoGrid" style="display: none;">
        <div class="info-item">
          <span class="info-label">File Name</span>
          <span class="info-value" id="infoFileName">-</span>
        </div>
        <div class="info-item">
          <span class="info-label">MIME Type</span>
          <span class="info-value" id="infoMimeType">-</span>
        </div>
        <div class="info-item">
          <span class="info-label">File Size</span>
          <span class="info-value" id="infoFileSize">-</span>
        </div>
        <div class="info-item">
          <span class="info-label">Estimated Chunks</span>
          <span class="info-value" id="infoEstChunks">-</span>
        </div>
      </div>

      <div class="actions">
        <button id="uploadBtn" class="btn-primary" disabled>
          <span>🚀</span> Upload Video
        </button>
        <button id="cancelBtn" class="btn-danger" disabled>
          <span>⏹️</span> Cancel
        </button>
        <button id="clearLogsBtn" class="btn-secondary">
          <span>🧹</span> Clear Logs
        </button>
      </div>
    </div>

    <!-- Upload Progress Card -->
    <div class="card">
      <div class="card-title">📊 Live Upload Progress</div>
      
      <div class="progress-container">
        <div class="progress-bar-bg">
          <div id="progressBarFill" class="progress-bar-fill"></div>
        </div>
      </div>

      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-val" id="metricPercent">0.0%</div>
          <div class="metric-lbl">Progress</div>
        </div>
        <div class="metric-card">
          <div class="metric-val" id="metricChunk">0 / 0</div>
          <div class="metric-lbl">Chunk</div>
        </div>
        <div class="metric-card">
          <div class="metric-val" id="metricBytes">0 MB / 0 MB</div>
          <div class="metric-lbl">Uploaded Data</div>
        </div>
        <div class="metric-card">
          <div class="metric-val" id="metricSpeed">0 MB/s</div>
          <div class="metric-lbl">Upload Speed</div>
        </div>
      </div>
    </div>

    <!-- Final Result Area -->
    <div id="resultCard" class="card result-section" style="display: none;">
      <div class="card-title" style="color: #34d399;">✅ Cloudinary Asset Result</div>
      
      <div class="secure-url-box">
        <a id="resultSecureUrl" href="#" target="_blank" rel="noopener noreferrer" class="secure-url-link">https://res.cloudinary.com/...</a>
        <button id="copyUrlBtn" class="btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;">📋 Copy</button>
      </div>

      <div class="file-info-grid" style="margin-bottom: 1rem;">
        <div class="info-item">
          <span class="info-label">Public ID</span>
          <span class="info-value" id="resPublicId">-</span>
        </div>
        <div class="info-item">
          <span class="info-label">Resource Type</span>
          <span class="info-value" id="resResourceType">-</span>
        </div>
        <div class="info-item">
          <span class="info-label">Format</span>
          <span class="info-value" id="resFormat">-</span>
        </div>
        <div class="info-item">
          <span class="info-label">Dimensions</span>
          <span class="info-value" id="resDimensions">-</span>
        </div>
        <div class="info-item">
          <span class="info-label">Bytes</span>
          <span class="info-value" id="resBytes">-</span>
        </div>
        <div class="info-item">
          <span class="info-label">Duration</span>
          <span class="info-value" id="resDuration">-</span>
        </div>
      </div>

      <details>
        <summary style="cursor: pointer; font-size: 0.85rem; color: var(--text-muted); font-weight: 500;">Original Cloudinary JSON Response</summary>
        <pre id="resultJson" class="json-viewer" style="margin-top: 0.5rem;"></pre>
      </details>
    </div>

    <!-- Log/Debug Box -->
    <div class="card">
      <div class="card-title">📝 Debug / Console Logs</div>
      <div id="logBox" class="log-box">
        <div class="log-entry INFO"><span class="time">[System]</span> <span class="tag">[READY]</span> Select a video file to test direct chunked upload.</div>
      </div>
    </div>
  </div>

  <script>
    // State Variables
    let selectedFile = null;
    let abortController = null;

    // DOM Elements
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('videoFile');
    const fileInfoGrid = document.getElementById('fileInfoGrid');
    const uploadBtn = document.getElementById('uploadBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const clearLogsBtn = document.getElementById('clearLogsBtn');
    const statusBadge = document.getElementById('statusBadge');
    const initEndpointInput = document.getElementById('initEndpoint');
    const authTokenInput = document.getElementById('authToken');
    const logBox = document.getElementById('logBox');

    // Progress Elements
    const progressBarFill = document.getElementById('progressBarFill');
    const metricPercent = document.getElementById('metricPercent');
    const metricChunk = document.getElementById('metricChunk');
    const metricBytes = document.getElementById('metricBytes');
    const metricSpeed = document.getElementById('metricSpeed');

    // Result Elements
    const resultCard = document.getElementById('resultCard');
    const resultSecureUrl = document.getElementById('resultSecureUrl');
    const copyUrlBtn = document.getElementById('copyUrlBtn');
    const resPublicId = document.getElementById('resPublicId');
    const resResourceType = document.getElementById('resResourceType');
    const resFormat = document.getElementById('resFormat');
    const resDimensions = document.getElementById('resDimensions');
    const resBytes = document.getElementById('resBytes');
    const resDuration = document.getElementById('resDuration');
    const resultJson = document.getElementById('resultJson');

    // Restore Auth Token from localStorage
    const savedToken = localStorage.getItem('handy_dev_upload_jwt');
    if (savedToken) {
      authTokenInput.value = savedToken;
    }
    authTokenInput.addEventListener('input', () => {
      localStorage.setItem('handy_dev_upload_jwt', authTokenInput.value.trim());
    });

    // File Selection Handlers
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFileSelect(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleFileSelect(e.target.files[0]);
      }
    });

    function handleFileSelect(file) {
      selectedFile = file;
      document.getElementById('infoFileName').textContent = file.name;
      document.getElementById('infoMimeType').textContent = file.type || 'video/mp4';
      document.getElementById('infoFileSize').textContent = \`\${formatBytes(file.size)} (\${file.size.toLocaleString()} bytes)\`;
      
      // Default estimated chunks at 20MB chunkSize
      const defaultChunkSize = 20 * 1024 * 1024;
      const estChunks = Math.ceil(file.size / defaultChunkSize);
      document.getElementById('infoEstChunks').textContent = \`~\${estChunks} chunks (at 20MB/chunk)\`;

      fileInfoGrid.style.display = 'grid';
      uploadBtn.disabled = false;
      log('INFO', \`Selected file: \${file.name} (\${formatBytes(file.size)})\`);
    }

    // Logger
    function log(level, message) {
      const now = new Date();
      const timeStr = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
      const entry = document.createElement('div');
      entry.className = \`log-entry \${level}\`;
      entry.innerHTML = \`<span class="time">[\${timeStr}]</span> <span class="tag">[\${level}]</span> \${escapeHtml(message)}\`;
      logBox.appendChild(entry);
      logBox.scrollTop = logBox.scrollHeight;
    }

    function escapeHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    clearLogsBtn.addEventListener('click', () => {
      logBox.innerHTML = '';
      log('INFO', 'Logs cleared.');
    });

    // Helper: Format Bytes
    function formatBytes(bytes, decimals = 2) {
      if (!bytes || bytes === 0) return '0 Bytes';
      const k = 1024;
      const dm = decimals < 0 ? 0 : decimals;
      const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    // Helper: Update Status Badge
    function updateStatus(status, type) {
      statusBadge.className = \`status-badge status-\${type}\`;
      statusBadge.textContent = status;
    }

    // Reset UI Metrics
    function resetMetrics() {
      progressBarFill.style.width = '0%';
      metricPercent.textContent = '0.0%';
      metricChunk.textContent = '0 / 0';
      metricBytes.textContent = '0 MB / 0 MB';
      metricSpeed.textContent = '0 MB/s';
      resultCard.style.display = 'none';
    }

    // Upload Action
    uploadBtn.addEventListener('click', startUpload);
    cancelBtn.addEventListener('click', () => {
      if (abortController) {
        abortController.abort();
        log('WARN', 'Cancel requested by user.');
      }
    });

    copyUrlBtn.addEventListener('click', () => {
      const url = resultSecureUrl.href;
      navigator.clipboard.writeText(url).then(() => {
        const origText = copyUrlBtn.textContent;
        copyUrlBtn.textContent = '✅ Copied!';
        setTimeout(() => copyUrlBtn.textContent = origText, 2000);
      });
    });

    async function startUpload() {
      if (!selectedFile) {
        alert('Please select a video file first.');
        return;
      }

      resetMetrics();
      uploadBtn.disabled = true;
      cancelBtn.disabled = false;
      abortController = new AbortController();
      const signal = abortController.signal;

      updateStatus('Initializing', 'initializing');
      log('INFO', \`Starting direct chunked upload process for file: \${selectedFile.name}\`);

      let initData;
      try {
        const endpoint = initEndpointInput.value.trim() || '/api/v1/uploads/video/init';
        const authToken = authTokenInput.value.trim();

        const headers = { 'Content-Type': 'application/json' };
        if (authToken) {
          headers['Authorization'] = authToken.startsWith('Bearer ') ? authToken : \`Bearer \${authToken}\`;
        }

        log('INFO', \`POST \${endpoint} (fileSize: \${selectedFile.size} bytes, mimeType: \${selectedFile.type || 'video/mp4'})...\`);

        const initRes = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            fileName: selectedFile.name,
            fileSize: selectedFile.size,
            mimeType: selectedFile.type || 'video/mp4'
          }),
          signal
        });

        if (!initRes.ok) {
          const errText = await initRes.text();
          throw new Error(\`Init API failed (\${initRes.status}): \${errText}\`);
        }

        const responseEnvelope = await initRes.json();
        log('SUCCESS', \`Init API responded: \${JSON.stringify(responseEnvelope)}\`);

        // Support envelope data property or direct object
        initData = responseEnvelope.data || responseEnvelope;
      } catch (err) {
        uploadBtn.disabled = false;
        cancelBtn.disabled = true;
        if (err.name === 'AbortError') {
          updateStatus('Cancelled', 'cancelled');
          log('WARN', 'Upload cancelled during initialization phase.');
          return;
        }
        updateStatus('Failed', 'failed');
        log('ERROR', \`Init API Error: \${err.message}\`);
        return;
      }

      const {
        uploadId,
        cloudName,
        apiKey,
        timestamp,
        signature,
        publicId,
        folder,
        uploadUrl,
        chunkSize: backendChunkSize
      } = initData;

      const chunkSize = backendChunkSize || (20 * 1024 * 1024);
      const totalFileSize = selectedFile.size;
      const totalChunks = Math.ceil(totalFileSize / chunkSize);

      log('INFO', \`Extracted parameters: uploadId=\${uploadId}, chunkSize=\${formatBytes(chunkSize)}, totalChunks=\${totalChunks}\`);
      log('INFO', \`Cloudinary Endpoint: \${uploadUrl}\`);

      updateStatus('Uploading', 'uploading');
      const startTime = Date.now();
      let uploadedBytes = 0;
      let finalCloudinaryResponse = null;

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        if (signal.aborted) {
          updateStatus('Cancelled', 'cancelled');
          log('WARN', 'Upload operation cancelled by user.');
          uploadBtn.disabled = false;
          cancelBtn.disabled = true;
          return;
        }

        const start = chunkIndex * chunkSize;
        const endExclusive = Math.min(start + chunkSize, totalFileSize);
        const endInclusive = endExclusive - 1;
        const chunkBlob = selectedFile.slice(start, endExclusive);

        const contentRange = \`bytes \${start}-\${endInclusive}/\${totalFileSize}\`;
        log('INFO', \`Chunk \${chunkIndex + 1}/\${totalChunks} (\${formatBytes(chunkBlob.size)}) | Header Content-Range: \${contentRange}\`);

        let chunkSuccess = false;
        let retryCount = 0;
        const MAX_RETRIES = 3;

        while (!chunkSuccess && retryCount <= MAX_RETRIES) {
          if (signal.aborted) {
            updateStatus('Cancelled', 'cancelled');
            log('WARN', 'Upload operation cancelled by user.');
            uploadBtn.disabled = false;
            cancelBtn.disabled = true;
            return;
          }

          if (retryCount > 0) {
            updateStatus('Retrying', 'retrying');
            log('WARN', \`Chunk \${chunkIndex + 1}/\${totalChunks} failed. Retrying (\${retryCount}/\${MAX_RETRIES}) in 1000ms...\`);
            await new Promise(res => setTimeout(res, 1000));
          }

          try {
            const formData = new FormData();
            formData.append('file', chunkBlob);
            formData.append('api_key', apiKey);
            formData.append('timestamp', timestamp.toString());
            formData.append('signature', signature);
            formData.append('public_id', publicId);
            if (folder) {
              formData.append('folder', folder);
            }

            const chunkHeaders = {
              'X-Unique-Upload-Id': uploadId,
              'Content-Range': contentRange
            };

            const chunkRes = await fetch(uploadUrl, {
              method: 'POST',
              headers: chunkHeaders,
              body: formData,
              signal
            });

            if (!chunkRes.ok) {
              const errText = await chunkRes.text();
              throw new Error(\`Cloudinary error HTTP \${chunkRes.status}: \${errText}\`);
            }

            const chunkJson = await chunkRes.json();
            log('SUCCESS', \`Chunk \${chunkIndex + 1}/\${totalChunks} uploaded. Cloudinary response: \${JSON.stringify(chunkJson)}\`);

            chunkSuccess = true;
            uploadedBytes += chunkBlob.size;

            // Calculate progress metrics
            const percent = Math.min(100, ((uploadedBytes / totalFileSize) * 100)).toFixed(1);
            const elapsedSec = (Date.now() - startTime) / 1000;
            const speedBytesPerSec = elapsedSec > 0 ? (uploadedBytes / elapsedSec) : 0;

            progressBarFill.style.width = \`\${percent}%\`;
            metricPercent.textContent = \`\${percent}%\`;
            metricChunk.textContent = \`\${chunkIndex + 1} / \${totalChunks}\`;
            metricBytes.textContent = \`\${formatBytes(uploadedBytes)} / \${formatBytes(totalFileSize)}\`;
            metricSpeed.textContent = \`\${formatBytes(speedBytesPerSec)}/s\`;

            if (chunkJson.done === true || chunkJson.secure_url || chunkIndex === totalChunks - 1) {
              finalCloudinaryResponse = chunkJson;
            }
          } catch (err) {
            if (err.name === 'AbortError') {
              updateStatus('Cancelled', 'cancelled');
              log('WARN', 'Upload operation cancelled by user.');
              uploadBtn.disabled = false;
              cancelBtn.disabled = true;
              return;
            }

            retryCount++;
            log('ERROR', \`Chunk \${chunkIndex + 1} attempt failed: \${err.message}\`);
            if (retryCount > MAX_RETRIES) {
              updateStatus('Failed', 'failed');
              log('ERROR', \`Chunk \${chunkIndex + 1} failed after \${MAX_RETRIES} retries. Upload aborted.\`);
              uploadBtn.disabled = false;
              cancelBtn.disabled = true;
              return;
            }
          }
        }
      }

      updateStatus('Completed', 'completed');
      log('SUCCESS', '🎉 All video chunks uploaded successfully directly to Cloudinary!');
      uploadBtn.disabled = false;
      cancelBtn.disabled = true;

      if (finalCloudinaryResponse) {
        renderResult(finalCloudinaryResponse);
      }
    }

    function renderResult(data) {
      resultCard.style.display = 'block';
      resultSecureUrl.href = data.secure_url || '#';
      resultSecureUrl.textContent = data.secure_url || 'N/A';

      resPublicId.textContent = data.public_id || 'N/A';
      resResourceType.textContent = data.resource_type || 'video';
      resFormat.textContent = data.format || 'N/A';
      resDimensions.textContent = (data.width && data.height) ? \`\${data.width} x \${data.height}\` : 'N/A';
      resBytes.textContent = data.bytes ? \`\${formatBytes(data.bytes)} (\${data.bytes.toLocaleString()} bytes)\` : 'N/A';
      resDuration.textContent = data.duration ? \`\${data.duration.toFixed(2)}s\` : 'N/A';

      resultJson.textContent = JSON.stringify(data, null, 2);
      resultCard.scrollIntoView({ behavior: 'smooth' });
    }
  </script>
</body>
</html>`;
}

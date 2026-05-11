const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // Set viewport to 16:9 presentation size
  await page.setViewport({ width: 1920, height: 1080 });

  const filePath = path.resolve(__dirname, 'DillizntPresentation.html');
  await page.goto(`file://${filePath}`, { waitUntil: 'networkidle0', timeout: 30000 });

  // Get total slide count
  const totalSlides = await page.evaluate(() => document.querySelectorAll('.slide').length);
  console.log(`Found ${totalSlides} slides`);

  // Inject styles to unstack all slides for print
  await page.evaluate(() => {
    // Remove overlays and nav elements
    document.querySelectorAll('.progress, .counter, .nav-hint, .fs-btn, .ambient').forEach(el => el.remove());

    // Hide pseudo-element overlays and force full-bleed layout
    const style = document.createElement('style');
    style.textContent = `
      @page { margin: 0 !important; size: 1920px 1080px !important; }
      body::before, body::after { display: none !important; }
      html {
        width: 1920px;
        height: auto !important;
        overflow: visible !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #020617 !important;
      }
      body {
        width: 1920px;
        height: auto !important;
        overflow: visible !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #020617 !important;
      }
      .deck {
        width: 1920px;
        height: auto !important;
        position: static !important;
        display: flex;
        flex-direction: column;
        margin: 0;
        padding: 0;
      }
      .slide {
        position: relative !important;
        inset: auto !important;
        opacity: 1 !important;
        visibility: visible !important;
        transform: none !important;
        pointer-events: auto !important;
        width: 1920px !important;
        height: 1080px !important;
        padding: 60px 115px !important;
        page-break-after: always;
        page-break-inside: avoid;
        overflow: hidden;
        flex-shrink: 0;
        background: #020617 !important;
        box-sizing: border-box;
        margin: 0 !important;
      }
      .slide-inner {
        max-width: 100% !important;
      }
      .slide .stagger > * {
        animation: none !important;
        opacity: 1 !important;
        transform: none !important;
      }
    `;
    document.head.appendChild(style);
  });

  // Wait for fonts to load
  await page.evaluateHandle('document.fonts.ready');
  await new Promise(r => setTimeout(r, 2000));

  const outputPath = path.resolve(__dirname, 'DillizntPresentation.pdf');

  await page.pdf({
    path: outputPath,
    width: '1920px',
    height: '1080px',
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    preferCSSPageSize: false
  });

  console.log(`PDF saved to: ${outputPath}`);
  await browser.close();
})();

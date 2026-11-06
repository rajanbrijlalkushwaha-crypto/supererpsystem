/**
 * printMerge.js — several printed documents (e.g. Tax Invoice + Delivery Challan) as ONE PDF.
 * POST /api/print-merge { htmls: [html, html, …] } → application/pdf (A4, in the order given)
 * Each html is a complete page already laid out in the browser; it is rendered with headless Chrome
 * and the pages are joined with pdf-lib.
 */
const express = require('express');
const { resolveUser } = require('./helpers');

const router = express.Router();

router.post('/', async (req, res) => {
  if (!resolveUser(req)) return res.status(401).json({ error: 'Please sign in again.' });
  const htmls = (Array.isArray(req.body?.htmls) ? req.body.htmls : []).map(String).filter(Boolean);
  if (!htmls.length || htmls.length > 20) return res.status(400).json({ error: 'Send 1 to 20 documents.' });
  let browser;
  try {
    const { PDFDocument } = require('pdf-lib');
    const puppeteer = require('puppeteer');
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    const out = await PDFDocument.create();
    for (const html of htmls) {
      await page.setContent(html, { waitUntil: 'load' });
      const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
      const src = await PDFDocument.load(pdf);
      (await out.copyPages(src, src.getPageIndices())).forEach(p => out.addPage(p));
    }
    await browser.close(); browser = null;
    res.setHeader('Content-Type', 'application/pdf');
    res.send(Buffer.from(await out.save()));
  } catch (e) {
    if (browser) { try { await browser.close(); } catch { /* closed */ } }
    res.status(500).json({ error: 'Could not make the PDF: ' + e.message });
  }
});

module.exports = router;

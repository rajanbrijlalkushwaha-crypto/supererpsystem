/**
 * printMerge.js — several printed documents (e.g. Tax Invoice + Delivery Challan) as ONE PDF.
 * POST /api/print-merge { htmls: [html, html, …], pdfs?: [base64 PDF, …] } → application/pdf (A4, in the order given;
 * ready PDFs — e.g. the e-way bill from the portal — come after the pages)
 * Each html is a complete page already laid out in the browser; it is rendered with headless Chrome
 * and the pages are joined with pdf-lib.
 */
const express = require('express');
const { resolveUser } = require('./helpers');

const router = express.Router();

router.post('/', async (req, res) => {
  if (!resolveUser(req)) return res.status(401).json({ error: 'Please sign in again.' });
  const htmls = (Array.isArray(req.body?.htmls) ? req.body.htmls : []).map(String).filter(Boolean);
  const pdfs = (Array.isArray(req.body?.pdfs) ? req.body.pdfs : []).map(x => Buffer.from(String(x).replace(/^data:[^,]*,/, ''), 'base64')).filter(b => b.slice(0, 5).toString('latin1') === '%PDF-');
  if ((!htmls.length && !pdfs.length) || htmls.length + pdfs.length > 20) return res.status(400).json({ error: 'Send 1 to 20 documents.' });
  let browser;
  try {
    const { PDFDocument } = require('pdf-lib');
    const puppeteer = require('puppeteer');
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    const out = await PDFDocument.create();
    for (const html of htmls) {
      await page.setContent(html, { waitUntil: 'load' });
      let pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
      let src = await PDFDocument.load(pdf);
      // a one-page document (no .pb page breaks) that spilled a little on to a 2nd page: shrink it a bit to fit one page
      if (src.getPageCount() === 2 && !(await page.$('.pb'))) {
        for (const scale of [0.96, 0.92, 0.88, 0.84]) {
          const p2 = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, scale });
          const s2 = await PDFDocument.load(p2);
          if (s2.getPageCount() === 1) { pdf = p2; src = s2; break; }
        }
      }
      (await out.copyPages(src, src.getPageIndices())).forEach(p => out.addPage(p));
    }
    for (const buf of pdfs) {
      const src = await PDFDocument.load(buf, { ignoreEncryption: true });
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

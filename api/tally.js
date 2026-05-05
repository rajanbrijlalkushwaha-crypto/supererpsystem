const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { ROOT, getCompanyPath, generateSequentialId } = require('./helpers');

const router = express.Router();

const TALLY_DB_PATH = path.join(ROOT, 'Database', 'TallyImport');
if (!fs.existsSync(TALLY_DB_PATH)) fs.mkdirSync(TALLY_DB_PATH, { recursive: true });

const TALLY_CONFIG_FILE   = path.join(TALLY_DB_PATH, 'config.json');
const TALLY_PENDING_FILE  = path.join(TALLY_DB_PATH, 'pending.json');
const TALLY_SNAPSHOT_FILE = path.join(TALLY_DB_PATH, 'snapshot.json');

const readTallyJson = (file, def) => {
  try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : def; }
  catch { return def; }
};

const writeTallyJson = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

const tallyRequest = (host, port, xmlBody, timeoutMs = 10000) => new Promise((resolve, reject) => {
  const buf = Buffer.from(xmlBody, 'utf8');
  const options = {
    hostname: host, port, path: '/', method: 'POST',
    headers: {
      'Content-Type': 'text/xml;charset=utf-8',
      'Content-Length': buf.length,
      'Connection': 'close',       // force Tally to flush and close — prevents empty-body hangs
    }
  };
  const req = http.request(options, (res) => {
    const chunks = [];
    res.on('data', c => chunks.push(c));
    res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
  req.on('error', reject);
  req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('Tally connection timeout. Make sure a company is open and ODBC server is enabled on port ' + port + '.')); });
  req.write(buf);
  req.end();
});

const xmlVal    = (xml, tag) => { const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i')); return m ? m[1].trim() : ''; };
const xmlVals   = (xml, tag) => { const r = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'gi'); const out = []; let m; while ((m = r.exec(xml)) !== null) out.push(m[1].trim()); return out; };
const xmlBlocks = (xml, tag) => { const r = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'gi'); const out = []; let m; while ((m = r.exec(xml)) !== null) out.push(m[0]); return out; };
const xmlAttr   = (block, attr) => { const m = block.match(new RegExp(`${attr}="([^"]*)"`,'i')); return m ? m[1].trim() : ''; };

const makeChecksum = (obj) => crypto.createHash('md5').update(JSON.stringify(obj)).digest('hex');

const parseRateUnit = (raw = '') => {
  const [valPart, unitPart] = raw.trim().split('/');
  return { value: parseFloat(valPart) || 0, unit: (unitPart || '').trim() };
};

const parseQtyUnit = (raw = '') => {
  const parts = raw.trim().split(/\s+/);
  return { qty: Math.abs(parseFloat(parts[0]) || 0), unit: parts.slice(1).join(' ').trim() };
};

const parseInventoryEntries = (voucherBlock) => {
  let entryBlocks = xmlBlocks(voucherBlock, 'ALLINVENTORYENTRIES\\.LIST');
  if (!entryBlocks.length) entryBlocks = xmlBlocks(voucherBlock, 'ALLINVENTORYENTRIES');
  if (!entryBlocks.length) entryBlocks = xmlBlocks(voucherBlock, 'INVENTORYENTRIES\\.LIST');
  if (!entryBlocks.length) entryBlocks = xmlBlocks(voucherBlock, 'INVENTORYENTRIES');

  return entryBlocks.map(e => {
    const itemName = xmlVal(e, 'STOCKITEMNAME');
    if (!itemName) return null;

    const descLines = xmlVals(e, 'BASICUSERDESCRIPTION').map(s => s.trim()).filter(Boolean);
    const description = descLines.join(' ');

    const rateRaw = xmlVal(e, 'RATE') || '0';
    const { value: rate, unit: rateUnit } = parseRateUnit(rateRaw);

    const billedRaw  = xmlVal(e, 'BILLEDQTY') || xmlVal(e, 'ACTUALQTY') || '0';
    const { qty: quantity, unit: qtyUnit } = parseQtyUnit(billedRaw);
    const unit = qtyUnit || rateUnit;

    const amount  = Math.abs(parseFloat(xmlVal(e, 'AMOUNT') || '0') || 0) || (quantity * rate);
    const hsnCode = xmlVal(e, 'GSTHSNNAME') || xmlVal(e, 'HSNNAME');

    let dueDate = '';
    const batchBlocks = xmlBlocks(e, 'BATCHALLOCATIONS\\.LIST').length
      ? xmlBlocks(e, 'BATCHALLOCATIONS\\.LIST')
      : xmlBlocks(e, 'BATCHALLOCATIONS');
    if (batchBlocks.length) {
      dueDate = xmlVal(batchBlocks[0], 'ORDERDUEDATE') || '';
    }

    return { itemName, description, quantity, unit, rate, amount, hsnCode, dueDate };
  }).filter(Boolean);
};

const tallyDate = (d = '') => d.length === 8 ? `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}` : d;

const tallyVoucherXml = (tallyCompany, voucherTypeName, collId) =>
  `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>${collId}</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><SVCURRENTCOMPANY>${tallyCompany}</SVCURRENTCOMPANY></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="${collId}" ISMODIFY="No" ISFIXED="No" ISOPTION="No" ISINTERNAL="No"><TYPE>Voucher</TYPE><FETCH>Date,VoucherNumber,VoucherTypeName,PartyLedgerName,PartyName,Amount,Narration,Reference,BasicOrderRef,BasicShippedBy,BasicFinalDestination,BasicDueDateOfPymt,StateName,PartyGSTIN,PlaceOfSupply,AllInventoryEntries.StockItemName,AllInventoryEntries.Rate,AllInventoryEntries.Amount,AllInventoryEntries.ActualQty,AllInventoryEntries.BilledQty,AllInventoryEntries.GSTHSNName,AllInventoryEntries.BasicUserDescription,AllInventoryEntries.BatchAllocations.OrderDueDate</FETCH><FILTER>Eps${collId}F</FILTER></COLLECTION><SYSTEM TYPE="Formulae" NAME="Eps${collId}F">$$IsEqual:$VoucherTypeName:"${voucherTypeName}"</SYSTEM></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;

const parseVouchers = (raw, targetType, tallyType, tallyCompany, companyId, snapshot, items) => {
  const hasItems = ['salesorder', 'purchaseorder'].includes(targetType);
  const blocks   = xmlBlocks(raw, 'VOUCHER');

  for (const block of blocks) {
    const voucherNumber = xmlVal(block, 'VOUCHERNUMBER') || xmlAttr(block, 'VOUCHERNUMBER');
    const date          = tallyDate(xmlVal(block, 'DATE') || xmlAttr(block, 'DATE') || '');
    const party         = xmlVal(block, 'PARTYLEDGERNAME') || xmlVal(block, 'PARTYNAME');
    const amount        = Math.abs(parseFloat(xmlVal(block, 'AMOUNT')) || 0);
    const narration     = xmlVal(block, 'NARRATION');

    const reference     = xmlVal(block, 'REFERENCE');
    const orderRef      = xmlVal(block, 'BASICORDERREF');
    const shippedBy     = xmlVal(block, 'BASICSHIPPEDBY');
    const destination   = xmlVal(block, 'BASICFINALDESTINATION');
    const paymentTerms  = xmlVal(block, 'BASICDUEDATEOFPYMT');
    const partyGstin    = xmlVal(block, 'PARTYGSTIN');
    const placeOfSupply = xmlVal(block, 'PLACEOFUPPLY');
    const stateName     = xmlVal(block, 'STATENAME');

    if (!voucherNumber && !date) continue;

    const lineItems = hasItems ? parseInventoryEntries(block) : [];

    const totalAmount = amount > 0
      ? amount
      : lineItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

    const data = {
      voucherNumber, date, party, amount: totalAmount, narration, tallyType,
      reference, orderRef, shippedBy, destination, paymentTerms,
      partyGstin, placeOfSupply, stateName,
      items: lineItems,
    };

    const checksum    = makeChecksum(data);
    const snapshotKey = `${companyId}::${tallyCompany}::${targetType}::${voucherNumber || date}`;
    const prevSnap    = snapshot[snapshotKey];

    let changeType;
    if (!prevSnap)                           changeType = 'new';
    else if (prevSnap.checksum === checksum) { continue; }
    else                                     changeType = 'modified';

    items.push({
      id: crypto.randomUUID ? crypto.randomUUID() : uuidv4(),
      tallyCompany, companyId,
      tallyType, targetType, changeType,
      status: 'pending',
      fetchedAt: new Date().toISOString(),
      data, checksum, snapshotKey,
      prevData: prevSnap ? prevSnap.data : null,
    });
  }
};

const erpRecordExists = (companyId, targetType, name) => {
  try {
    const subDir = targetType === 'client' ? 'Client' : 'Vendor';
    const dir = path.join(ROOT, 'Database', 'Companies', companyId, subDir);
    if (!fs.existsSync(dir)) return false;
    for (const folder of fs.readdirSync(dir)) {
      const folderPath = path.join(dir, folder);
      if (!fs.statSync(folderPath).isDirectory()) continue;
      for (const file of fs.readdirSync(folderPath).filter(f => f.endsWith('.json'))) {
        try {
          const rec = JSON.parse(fs.readFileSync(path.join(folderPath, file), 'utf8'));
          const recName = (rec.companyName || rec.vendorName || '').trim().toLowerCase();
          if (recName === name.trim().toLowerCase()) return true;
        } catch {}
      }
    }
    return false;
  } catch { return false; }
};

// GET /api/tally/ping — raw connectivity test, returns exactly what Tally sends back
router.get('/ping', async (_req, res) => {
  try {
    const cfg = readTallyJson(TALLY_CONFIG_FILE, { host: 'localhost', port: 9000 });
    // Simplest possible XML Tally should respond to
    const xml = `<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>List of Companies</REPORTNAME></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>`;
    const raw = await tallyRequest(cfg.host, cfg.port, xml, 8000);
    res.json({
      host: cfg.host, port: cfg.port,
      responseLength: raw.length,
      responsePreview: raw.substring(0, 1000),
      isEmpty: raw.trim().length === 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tally/local-ips — returns server's local IPv4 addresses
router.get('/local-ips', (_req, res) => {
  const ifaces = os.networkInterfaces();
  const ips = [];
  for (const list of Object.values(ifaces)) {
    for (const addr of list) {
      if (addr.family === 'IPv4' && !addr.internal) ips.push(addr.address);
    }
  }
  res.json({ ips: ['localhost', ...ips] });
});

// GET /api/tally/config
router.get('/config', (_req, res) => {
  res.json(readTallyJson(TALLY_CONFIG_FILE, { host: 'localhost', port: 9000 }));
});

// POST /api/tally/config
router.post('/config', (req, res) => {
  const config = { host: req.body.host || 'localhost', port: parseInt(req.body.port) || 9000 };
  writeTallyJson(TALLY_CONFIG_FILE, config);
  res.json({ success: true, config });
});

// Shared XML payloads for company discovery
// xml1: Standard collection, no company scope
const CO_XML1 = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>EpsCoList</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="EpsCoList" ISMODIFY="No" ISFIXED="No" ISOPTION="No" ISINTERNAL="No"><TYPE>Company</TYPE><FETCH>Name,FormalName,BasicCompanyFormalName,GUID</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
// xml2: Built-in report
const CO_XML2 = `<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>List of Companies</REPORTNAME><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>`;
// xml3: Collection with more fields
const CO_XML3 = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>AllCo</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="AllCo"><TYPE>Company</TYPE><FETCH>Name,StartingFrom,PinCode,StateName,Email,Phone,GSTIN,PAN,FormalName</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
// xml4: Company report
const CO_XML4 = `<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>Company</REPORTNAME><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>`;
// xml5: TDL Report loop
const CO_XML5 = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Data</TYPE><ID>EpsCoReport</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES><TDL><TDLMESSAGE><REPORT NAME="EpsCoReport"><FORMS>EpsCoForm</FORMS></REPORT><FORM NAME="EpsCoForm"><TOPPARTS>EpsCoPart</TOPPARTS></FORM><PART NAME="EpsCoPart"><TOPLINES>EpsCoLine</TOPLINES><REPEAT>EpsCoLine:EpsCoCollection</REPEAT><SCROLLED>Vertical</SCROLLED></PART><LINE NAME="EpsCoLine"><LEFTFIELDS>EpsCoFld</LEFTFIELDS></LINE><FIELD NAME="EpsCoFld"><SET>$Name</SET><XMLTAG>CONAME</XMLTAG></FIELD><COLLECTION NAME="EpsCoCollection"><TYPE>Company</TYPE><FETCH>Name,FormalName</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
// xml6: Empty SVCURRENTCOMPANY — forces Tally to list ALL loaded companies
const CO_XML6 = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>EpsCoAll</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><SVCURRENTCOMPANY></SVCURRENTCOMPANY></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="EpsCoAll" ISMODIFY="No" ISFIXED="No" ISOPTION="No" ISINTERNAL="No"><TYPE>Company</TYPE><FETCH>Name,FormalName,BasicCompanyFormalName,GUID,StartingFrom</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
// xml7: TDL loop with empty SVCURRENTCOMPANY
const CO_XML7 = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Data</TYPE><ID>EpsCoReport2</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><SVCURRENTCOMPANY></SVCURRENTCOMPANY></STATICVARIABLES><TDL><TDLMESSAGE><REPORT NAME="EpsCoReport2"><FORMS>EpsCoForm2</FORMS></REPORT><FORM NAME="EpsCoForm2"><TOPPARTS>EpsCoPart2</TOPPARTS></FORM><PART NAME="EpsCoPart2"><TOPLINES>EpsCoLine2</TOPLINES><REPEAT>EpsCoLine2:EpsCoCollection2</REPEAT><SCROLLED>Vertical</SCROLLED></PART><LINE NAME="EpsCoLine2"><LEFTFIELDS>EpsCoFld2</LEFTFIELDS></LINE><FIELD NAME="EpsCoFld2"><SET>$Name</SET><XMLTAG>CONAME</XMLTAG></FIELD><COLLECTION NAME="EpsCoCollection2"><TYPE>Company</TYPE><FETCH>Name,FormalName</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
// xml8: Absolute minimal — no TDL, no static vars, just the report name (some older ERP9 builds need this)
const CO_XML8 = `<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>List of Companies</REPORTNAME></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>`;
// xml9: Tally Prime REST-style request
const CO_XML9 = `<ENVELOPE><HEADER><TALLYREQUEST>EXPORT</TALLYREQUEST><TYPE>COLLECTION</TYPE><ID>COMPANY</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES></DESC></BODY></ENVELOPE>`;

// Extract all company names from any Tally XML response format
const extractCompanyNames = (xml) => {
  const names = new Set();
  // Reject: empty, 1-char, TDL expressions, pure numbers
  const bad = v => !v || v.length < 2 || v.startsWith('$$') || v.startsWith('#') || /^\d+$/.test(v);

  // Format A: <COMPANY NAME="X"> attribute + child tags
  xmlBlocks(xml, 'COMPANY').forEach(b => {
    const attr = xmlAttr(b, 'NAME');
    if (attr && !bad(attr)) names.add(attr.trim());
    ['NAME','FORMALNAME','BASICCOMPANYFORMALNAME'].forEach(tag => {
      const v = xmlVal(b, tag);
      if (v && !bad(v)) names.add(v.trim());
    });
  });

  // Format B: flat tags (ERP9 & Prime variants)
  ['BASICCOMPANYFORMALNAME','BASICCOMPANYNAME','FORMALNAME','CONAME'].forEach(tag =>
    xmlVals(xml, tag).forEach(v => { if (!bad(v.trim())) names.add(v.trim()); })
  );

  // Format C: TALLYMESSAGE wrappers (some Prime responses wrap each company)
  xmlBlocks(xml, 'TALLYMESSAGE').forEach(b => {
    xmlBlocks(b, 'COMPANY').forEach(cb => {
      const cv = xmlAttr(cb, 'NAME') || xmlVal(cb, 'NAME');
      if (cv && !bad(cv)) names.add(cv.trim());
    });
  });

  // Format D: Prime report rows — <FIELDVALUE> / <DSPDISPNAME>
  ['FIELDVALUE','DSPDISPNAME'].forEach(tag =>
    xmlVals(xml, tag).forEach(v => { v = v.trim(); if (!bad(v)) names.add(v); })
  );

  // Format E: last-resort bare <NAME> scan
  const nameRe = /<NAME>([^<]{2,})<\/NAME>/gi;
  let m;
  while ((m = nameRe.exec(xml)) !== null) {
    const v = m[1].trim();
    if (!bad(v)) names.add(v);
  }

  return [...names].filter(Boolean);
};

// Read all company names from Tally's data folder on disk (fallback when XML API returns only current company)
const discoverCompaniesFromDisk = () => {
  // Common Tally.ini locations (Windows)
  const iniPaths = [
    'C:\\Tally.ERP9\\Tally.ini',
    'C:\\Program Files\\Tally.ERP9\\Tally.ini',
    'C:\\Program Files (x86)\\Tally.ERP9\\Tally.ini',
    path.join(os.homedir(), 'Tally.ERP9', 'Tally.ini'),
    'C:\\TallyPrime\\Tally.ini',
    'C:\\Program Files\\TallyPrime\\Tally.ini',
    'C:\\Program Files (x86)\\TallyPrime\\Tally.ini',
    path.join(os.homedir(), 'TallyPrime', 'Tally.ini'),
  ];

  for (const iniPath of iniPaths) {
    if (!fs.existsSync(iniPath)) continue;
    try {
      const ini = fs.readFileSync(iniPath, 'utf8');
      const dataMatch = ini.match(/^Data\s*=\s*(.+)$/mi);
      if (!dataMatch) continue;
      let dataDir = dataMatch[1].trim();
      // Relative path in Tally.ini is relative to the ini file's folder
      if (!path.isAbsolute(dataDir)) dataDir = path.join(path.dirname(iniPath), dataDir);
      if (!fs.existsSync(dataDir)) continue;

      const names = [];
      for (const entry of fs.readdirSync(dataDir)) {
        if (!/^\d+$/.test(entry)) continue;
        const companyFile = path.join(dataDir, entry, 'Company.900');
        if (!fs.existsSync(companyFile)) continue;
        try {
          const buf = fs.readFileSync(companyFile);
          // Company name is a printable ASCII/UTF-8 string embedded in the binary.
          // Scan for runs of printable characters (length 3-100) — the company name
          // is typically one of the first long strings after the file header.
          const str = buf.toString('binary');
          const candidates = [];
          const re = /[\x20-\x7E]{3,100}/g;
          let m;
          while ((m = re.exec(str)) !== null) {
            const v = m[0].trim();
            if (v.length >= 3 && !/^\d+$/.test(v) && !/^[A-Z]{1,2}$/.test(v)) {
              candidates.push(v);
            }
            if (candidates.length >= 10) break; // only need first few
          }
          // First candidate that looks like a company name (has letters)
          const name = candidates.find(c => /[a-zA-Z]/.test(c) && c.length >= 3);
          if (name) names.push(name);
        } catch {}
      }
      if (names.length > 0) return names;
    } catch {}
  }
  return [];
};

// Query one Tally port — returns { port, names[], raw } or null on failure
const queryTallyPort = async (host, port) => {
  const SCAN_TIMEOUT = 3000;
  const results = await Promise.all([
    tallyRequest(host, port, CO_XML1, SCAN_TIMEOUT).catch(() => ''),
    tallyRequest(host, port, CO_XML2, SCAN_TIMEOUT).catch(() => ''),
    tallyRequest(host, port, CO_XML3, SCAN_TIMEOUT).catch(() => ''),
    tallyRequest(host, port, CO_XML4, SCAN_TIMEOUT).catch(() => ''),
    tallyRequest(host, port, CO_XML5, SCAN_TIMEOUT).catch(() => ''),
    tallyRequest(host, port, CO_XML6, SCAN_TIMEOUT).catch(() => ''),
    tallyRequest(host, port, CO_XML7, SCAN_TIMEOUT).catch(() => ''),
    tallyRequest(host, port, CO_XML8, SCAN_TIMEOUT).catch(() => ''),
    tallyRequest(host, port, CO_XML9, SCAN_TIMEOUT).catch(() => ''),
  ]);
  const combined = results.join('\n');
  const names = extractCompanyNames(combined);
  return { port, names, raw: combined };
};

// GET /api/tally/companies
router.get('/companies', async (_req, res) => {
  try {
    const cfg = readTallyJson(TALLY_CONFIG_FILE, { host: 'localhost', port: 9000 });

    // Scan the configured port PLUS the next 4 ports in parallel.
    // When users run 2 separate Tally windows, the 2nd instance uses port+1 automatically.
    const basePort = parseInt(cfg.port) || 9000;
    const portsToScan = [basePort, basePort+1, basePort+2, basePort+3, basePort+4];

    const portResults = await Promise.all(
      portsToScan.map(p => queryTallyPort(cfg.host, p).catch(() => null))
    );

    // Merge: deduplicate names case-insensitively across all ports,
    // keep the company's associated port for later use (fetching data)
    const seen     = new Map(); // lowerName → { name, port }
    const debugInfo = [];

    for (const result of portResults) {
      if (!result) continue;
      debugInfo.push({ port: result.port, found: result.names, snippet: result.raw.substring(0, 400) });
      for (const name of result.names) {
        const k = name.toLowerCase();
        if (!seen.has(k)) seen.set(k, { name, port: result.port });
      }
    }

    // Build final company list
    let companies = [...seen.values()].map(({ name, port }) => ({ name, port }));

    // Fallback: if XML API only returned 1 (Tally limitation — only returns active company),
    // supplement with names found from Tally's data directory on disk
    if (companies.length <= 1) {
      const diskNames = discoverCompaniesFromDisk();
      for (const name of diskNames) {
        const k = name.toLowerCase();
        if (!seen.has(k)) {
          // Use the configured base port for disk-discovered companies
          companies.push({ name, port: basePort, fromDisk: true });
          seen.set(k, { name, port: basePort });
        }
      }
    }

    if (companies.length === 0) {
      return res.status(200).json({ companies: [], _debug: debugInfo });
    }

    res.json({ companies });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/tally/company-info?name=XYZ&port=9001 — fetch details of a specific Tally company
router.get('/company-info', async (req, res) => {
  try {
    const { name, port: qPort } = req.query;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const cfg = readTallyJson(TALLY_CONFIG_FILE, { host: 'localhost', port: 9000 });
    if (qPort) cfg.port = parseInt(qPort) || cfg.port;

    const xml = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>EpsCoInfo</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><SVCURRENTCOMPANY>${name}</SVCURRENTCOMPANY></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="EpsCoInfo"><TYPE>Company</TYPE><FETCH>Name,FormalName,Address,StateName,PinCode,Email,Phone,LedgerPhone,GSTIN,PAN,StartingFrom,BooksFrom,BooksFromDate,CurrencyName,CountryName</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;

    const raw = await tallyRequest(cfg.host, cfg.port, xml).catch(() => '');
    const blocks = xmlBlocks(raw, 'COMPANY');
    let info = { name, address: '', state: '', pincode: '', email: '', phone: '', gstin: '', pan: '' };

    if (blocks.length > 0) {
      const b = blocks[0];
      const addresses = xmlVals(b, 'ADDRESS').filter(Boolean).map(a => a.trim());
      info = {
        name:     xmlVal(b, 'NAME') || xmlAttr(b, 'NAME') || name,
        formalName: xmlVal(b, 'FORMALNAME') || name,
        address:  [...new Set(addresses)].join(', '),
        state:    xmlVal(b, 'STATENAME') || '',
        pincode:  xmlVal(b, 'PINCODE') || '',
        email:    xmlVal(b, 'EMAIL') || '',
        phone:    xmlVal(b, 'PHONE') || xmlVal(b, 'LEDGERPHONE') || '',
        gstin:    xmlVal(b, 'GSTIN') || '',
        pan:      xmlVal(b, 'PAN') || '',
        currency: xmlVal(b, 'CURRENCYNAME') || 'INR',
        country:  xmlVal(b, 'COUNTRYNAME') || 'India',
      };
    }
    res.json(info);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/tally/create-erp-company — create ERP company from Tally data
router.post('/create-erp-company', async (req, res) => {
  try {
    const { name, address, state, pincode, email, phone, gstin, pan, formalName } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const jstore = require('./json-store');
    const companyId = jstore.nextCompanyId();
    const companyData = {
      companyId,
      companyName: formalName || name,
      address: address || '',
      city: '',
      state: state || '',
      pincode: pincode || '',
      gstin: gstin || '',
      pan: pan || '',
      email: email || '',
      phone: phone || '',
      website: '',
      bankName: '', bankAccount: '', bankIfsc: '',
      isDefault: false,
      logoFileName: '',
      tallyImported: true,
      tallyCompanyName: name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const companiesDir = path.join(ROOT, 'Database', 'Companies');
    fs.writeFileSync(path.join(companiesDir, `${companyId}.json`), JSON.stringify(companyData, null, 2));

    // Create subdirectories
    ['Client','Vendor','SalesOrder','PurchaseOrder','Payment','Receipt','Items','Stock','Ledger'].forEach(sub => {
      const d = path.join(companiesDir, companyId, sub);
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    });

    res.json({ success: true, company: companyData });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/tally/rawdebug — scans ports 9000-9004, shows raw XML from each
router.get('/rawdebug', async (_req, res) => {
  try {
    const cfg = readTallyJson(TALLY_CONFIG_FILE, { host: 'localhost', port: 9000 });
    const basePort = parseInt(cfg.port) || 9000;
    const portsToScan = [basePort, basePort+1, basePort+2, basePort+3, basePort+4];
    const sep = '\n' + '='.repeat(80) + '\n';

    const portOutputs = await Promise.all(portsToScan.map(async p => {
      const results = await Promise.all([
        tallyRequest(cfg.host, p, CO_XML1, 3000).catch(e => `ERROR: ${e.message}`),
        tallyRequest(cfg.host, p, CO_XML2, 3000).catch(e => `ERROR: ${e.message}`),
        tallyRequest(cfg.host, p, CO_XML3, 3000).catch(e => `ERROR: ${e.message}`),
        tallyRequest(cfg.host, p, CO_XML4, 3000).catch(e => `ERROR: ${e.message}`),
        tallyRequest(cfg.host, p, CO_XML5, 3000).catch(e => `ERROR: ${e.message}`),
      ]);
      const labels = ['Collection Company','List of Companies report','Collection AllCo','Company report','TDL loop'];
      const body = results.map((r, i) => `--- xml${i+1} (${labels[i]}) ---\n${r}`).join('\n\n');
      const names = extractCompanyNames(results.join('\n'));
      return `\n${'#'.repeat(80)}\nPORT ${p}  →  companies found: [${names.join(', ') || 'NONE'}]\n${'#'.repeat(80)}\n${body}`;
    }));

    res.type('text/plain').send(portOutputs.join(sep));
  } catch (err) { res.status(500).send(err.message); }
});

// POST /api/tally/fetch
router.post('/fetch', async (req, res) => {
  try {
    const { tallyCompany, dataTypes = ['debtors', 'creditors'], companyId, tallyPort } = req.body;
    if (!tallyCompany) return res.status(400).json({ error: 'tallyCompany is required' });
    if (!companyId) return res.status(400).json({ error: 'companyId is required' });

    const cfg      = readTallyJson(TALLY_CONFIG_FILE, { host: 'localhost', port: 9000 });
    if (tallyPort) cfg.port = parseInt(tallyPort) || cfg.port;
    const snapshot = readTallyJson(TALLY_SNAPSHOT_FILE, {});
    const items    = [];

    const wantDebtors   = dataTypes.includes('debtors');
    const wantCreditors = dataTypes.includes('creditors');
    const wantAllLedgers = dataTypes.includes('ledgers');

    if (wantDebtors || wantCreditors || wantAllLedgers) {
      const ledgerXml = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>EpsLedgers</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><SVCURRENTCOMPANY>${tallyCompany}</SVCURRENTCOMPANY></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="EpsLedgers" ISMODIFY="No" ISFIXED="No" ISOPTION="No" ISINTERNAL="No"><TYPE>Ledger</TYPE><FETCH>Name,Parent,Address,GSTIN,PartyGSTIN,Email,LedgerPhone,PinCode,LedgerPinCode,LedgerStateName,StateName,OpeningBalance,ClosingBalance</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
      const raw = await tallyRequest(cfg.host, cfg.port, ledgerXml);

      for (const block of xmlBlocks(raw, 'LEDGER')) {
        const name   = xmlAttr(block, 'NAME') || xmlVal(block, 'NAME');
        const parent = xmlVal(block, 'PARENT');
        if (!name) continue;

        const parentLower    = parent.toLowerCase();
        const isDebtor       = parentLower.includes('sundry debtor');
        const isCreditor     = parentLower.includes('sundry creditor');

        // For "all ledgers" mode, include everything; otherwise filter
        if (!wantAllLedgers) {
          if (!isDebtor && !isCreditor) continue;
          if (isDebtor && !wantDebtors) continue;
          if (isCreditor && !wantCreditors) continue;
        }

        // Determine target type: debtors → clients, creditors → vendors, rest → ledger
        let targetType, tallyTypeLabel;
        if (isDebtor)   { targetType = 'client'; tallyTypeLabel = 'Debtor'; }
        else if (isCreditor) { targetType = 'vendor'; tallyTypeLabel = 'Creditor'; }
        else            { targetType = 'ledger'; tallyTypeLabel = parent || 'Ledger'; }

        const addresses       = xmlVals(block, 'ADDRESS').filter(Boolean);
        const uniqueAddresses = [...new Set(addresses.map(a => a.trim()).filter(Boolean))];
        const gstin           = xmlVal(block, 'GSTIN') || xmlVal(block, 'PARTYGSTIN');
        const email           = xmlVal(block, 'EMAIL');
        const phone           = xmlVal(block, 'LEDGERPHONE') || xmlVal(block, 'PHONE');
        const pincode         = xmlVal(block, 'PINCODE') || xmlVal(block, 'LEDGERPINCODE');
        const state           = xmlVal(block, 'LEDGERSTATENAME') || xmlVal(block, 'STATENAME');
        const openingBal      = parseFloat(xmlVal(block, 'OPENINGBALANCE')) || 0;
        const closingBal      = parseFloat(xmlVal(block, 'CLOSINGBALANCE')) || 0;

        const data        = { companyName: name, ledgerName: name, address: uniqueAddresses.join(', '), gstin, email, phone, pincode, state, openingBalance: openingBal, closingBalance: closingBal, tallyParent: parent };
        const checksum    = makeChecksum(data);
        const snapshotKey = `${companyId}::${tallyCompany}::${name}`;
        const prevSnap    = snapshot[snapshotKey];
        const existsInERP = (targetType === 'client' || targetType === 'vendor') ? erpRecordExists(companyId, targetType, name) : false;

        let changeType;
        if (!existsInERP && !prevSnap)              changeType = 'new';
        else if (!prevSnap)                         changeType = 'new';
        else if (prevSnap.checksum === checksum)    { continue; }
        else                                        changeType = 'modified';

        items.push({
          id: crypto.randomUUID ? crypto.randomUUID() : uuidv4(),
          tallyCompany, companyId,
          tallyType: tallyTypeLabel,
          targetType, changeType,
          status: 'pending',
          fetchedAt: new Date().toISOString(),
          data, checksum, snapshotKey,
          prevData: prevSnap ? prevSnap.data : null,
        });
      }
    }

    const voucherTypes = [
      { key: 'salesorders',    tallyName: 'Sales Order',    targetType: 'salesorder',    tallyType: 'Sales Order'    },
      { key: 'purchaseorders', tallyName: 'Purchase Order', targetType: 'purchaseorder', tallyType: 'Purchase Order' },
      { key: 'payments',       tallyName: 'Payment',        targetType: 'payment',        tallyType: 'Payment'        },
      { key: 'receipts',       tallyName: 'Receipt',        targetType: 'receipt',        tallyType: 'Receipt'        },
    ];

    await Promise.all(
      voucherTypes
        .filter(v => dataTypes.includes(v.key))
        .map(async ({ tallyName, targetType, tallyType, key }) => {
          const collId = `Eps${key}`;
          const xml    = tallyVoucherXml(tallyCompany, tallyName, collId);
          const raw    = await tallyRequest(cfg.host, cfg.port, xml).catch(() => '');
          parseVouchers(raw, targetType, tallyType, tallyCompany, companyId, snapshot, items);
        })
    );

    res.json({ items, total: items.length, tallyCompany });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/tally/stage
router.post('/stage', (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items array required' });
    const pending = readTallyJson(TALLY_PENDING_FILE, []);
    const keys = new Set(items.map(i => i.snapshotKey));
    const filtered = pending.filter(p => !keys.has(p.snapshotKey));
    const newPending = [...filtered, ...items];
    writeTallyJson(TALLY_PENDING_FILE, newPending);
    res.json({ success: true, staged: items.length, total: newPending.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/tally/pending
router.get('/pending', (req, res) => {
  const { companyId } = req.query;
  let pending = readTallyJson(TALLY_PENDING_FILE, []);
  if (companyId) pending = pending.filter(p => p.companyId === companyId);
  res.json(pending);
});

// POST /api/tally/approve
router.post('/approve', (req, res) => {
  try {
    const { ids, companyId } = req.body;
    if (!Array.isArray(ids) || !companyId) return res.status(400).json({ error: 'ids array and companyId required' });

    let pending = readTallyJson(TALLY_PENDING_FILE, []);
    const snapshot = readTallyJson(TALLY_SNAPSHOT_FILE, {});
    const toApprove = pending.filter(p => ids.includes(p.id) && p.status === 'pending');

    const imported = { clients: 0, vendors: 0, salesorders: 0, purchaseorders: 0, payments: 0, receipts: 0 };
    const safeName = s => (s || 'record').replace(/[^a-zA-Z0-9]/g, '_');

    for (const item of toApprove) {
      const { data, targetType, checksum, snapshotKey } = item;

      if (targetType === 'client') {
        const dir = getCompanyPath('Client', companyId);
        const clientId = generateSequentialId(dir, 100001);
        const record = {
          clientId, companyName: data.companyName, address: data.address || '',
          city: '', state: data.state || '', pincode: data.pincode || '',
          gstin: data.gstin || '', gstType: 'Regular',
          contactPersons: data.phone ? [{ id: 1, name: data.companyName, mobileNumber: data.phone, email: data.email || '', designation: '' }] : [],
          documents: [], status: 'pending', tallyImported: true, tallyParent: data.tallyParent,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        };
        const recDir = path.join(dir, `${clientId}`);
        if (!fs.existsSync(recDir)) fs.mkdirSync(recDir, { recursive: true });
        fs.writeFileSync(path.join(recDir, `${clientId}-${safeName(data.companyName)}.json`), JSON.stringify(record, null, 2));
        imported.clients++;

      } else if (targetType === 'vendor') {
        const dir = getCompanyPath('Vendor', companyId);
        const vendorId = generateSequentialId(dir, 200001);
        const record = {
          vendorId, vendorName: data.companyName, address: data.address || '',
          city: '', state: data.state || '', pincode: data.pincode || '',
          gstin: data.gstin || '', gstType: 'Regular',
          contactPersons: data.phone ? [{ id: 1, name: data.companyName, mobileNumber: data.phone, email: data.email || '', designation: '' }] : [],
          documents: [], status: 'pending', tallyImported: true, tallyParent: data.tallyParent,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        };
        const recDir = path.join(dir, `${vendorId}`);
        if (!fs.existsSync(recDir)) fs.mkdirSync(recDir, { recursive: true });
        fs.writeFileSync(path.join(recDir, `${vendorId}-${safeName(data.companyName)}.json`), JSON.stringify(record, null, 2));
        imported.vendors++;

      } else if (targetType === 'ledger') {
        const dir = getCompanyPath('Ledger', companyId);
        const ledgerId = generateSequentialId(dir, 700001);
        const record = {
          ledgerId,
          ledgerName: data.ledgerName || data.companyName,
          tallyParent: data.tallyParent || '',
          address: data.address || '',
          state: data.state || '',
          pincode: data.pincode || '',
          gstin: data.gstin || '',
          email: data.email || '',
          phone: data.phone || '',
          openingBalance: data.openingBalance || 0,
          closingBalance: data.closingBalance || 0,
          tallyImported: true,
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const recDir = path.join(dir, `${ledgerId}`);
        if (!fs.existsSync(recDir)) fs.mkdirSync(recDir, { recursive: true });
        fs.writeFileSync(path.join(recDir, `${ledgerId}-${safeName(record.ledgerName)}.json`), JSON.stringify(record, null, 2));
        imported.ledgers = (imported.ledgers || 0) + 1;

      } else if (['salesorder', 'purchaseorder', 'payment', 'receipt'].includes(targetType)) {
        const subDirMap = { salesorder: 'SalesOrder', purchaseorder: 'PurchaseOrder', payment: 'Payment', receipt: 'Receipt' };
        const idStartMap = { salesorder: 300001, purchaseorder: 400001, payment: 500001, receipt: 600001 };
        const dir    = getCompanyPath(subDirMap[targetType], companyId);
        const recId  = generateSequentialId(dir, idStartMap[targetType] || 700001);
        const recDir = path.join(dir, `${recId}`);
        fs.mkdirSync(recDir, { recursive: true });

        const lineItems   = Array.isArray(data.items) ? data.items : [];
        const totalAmount = data.amount && data.amount > 0
          ? data.amount
          : lineItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

        const record = {
          orderId: recId,
          ...data,
          amount: totalAmount,
          clientName: data.party || '',
          orderDate:  data.date  || '',
          reference:  data.reference || '',
          orderRef:   data.orderRef  || '',
          shippedBy:  data.shippedBy || '',
          destination: data.destination || '',
          paymentTerms: data.paymentTerms || '',
          partyGstin:   data.partyGstin  || '',
          placeOfSupply: data.placeOfSupply || '',
          items: lineItems,
          documents: [],
          targetType, tallyImported: true,
          status: 'pending',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        fs.writeFileSync(path.join(recDir, `${recId}.json`), JSON.stringify(record, null, 2));
        imported[`${targetType}s`] = (imported[`${targetType}s`] || 0) + 1;
      }

      snapshot[snapshotKey] = { checksum, data, importedAt: new Date().toISOString() };
    }

    pending = pending.filter(p => !ids.includes(p.id));
    writeTallyJson(TALLY_PENDING_FILE, pending);
    writeTallyJson(TALLY_SNAPSHOT_FILE, snapshot);

    res.json({ success: true, imported, remaining: pending.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/tally/reject
router.post('/reject', (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
    let pending = readTallyJson(TALLY_PENDING_FILE, []);
    pending = pending.filter(p => !ids.includes(p.id));
    writeTallyJson(TALLY_PENDING_FILE, pending);
    res.json({ success: true, remaining: pending.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

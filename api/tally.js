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

const tallyRequest = (host, port, xmlBody) => new Promise((resolve, reject) => {
  const buf = Buffer.from(xmlBody, 'utf8');
  const options = { hostname: host, port, path: '/', method: 'POST',
    headers: { 'Content-Type': 'text/xml', 'Content-Length': buf.length } };
  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => resolve(data));
  });
  req.on('error', reject);
  req.setTimeout(10000, () => { req.destroy(); reject(new Error('Tally connection timeout. Ensure Tally is open and ODBC server is enabled (Gateway of Tally → F12 → Advanced Config → Enable ODBC Server).')); });
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

// GET /api/tally/companies
router.get('/companies', async (_req, res) => {
  try {
    const cfg = readTallyJson(TALLY_CONFIG_FILE, { host: 'localhost', port: 9000 });

    const erp9Xml  = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>EpsCoList</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="EpsCoList" ISMODIFY="No" ISFIXED="No" ISOPTION="No" ISINTERNAL="No"><TYPE>Company</TYPE><FETCH>Name</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
    const primeXml = `<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>List of Companies</REPORTNAME><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>`;

    const [erp9Raw, primeRaw] = await Promise.all([
      tallyRequest(cfg.host, cfg.port, erp9Xml).catch(() => ''),
      tallyRequest(cfg.host, cfg.port, primeXml).catch(() => ''),
    ]);

    const allRaw = erp9Raw + '\n' + primeRaw;

    const extractNames = (xml) => {
      const names = new Set();
      xmlBlocks(xml, 'COMPANY').forEach(b => {
        const n = xmlVal(b, 'NAME') || xmlAttr(b, 'NAME');
        if (n) names.add(n.trim());
      });
      xmlVals(xml, 'BASICCOMPANYNAME').forEach(n => names.add(n.trim()));
      xmlVals(xml, 'CONAME').forEach(n => names.add(n.trim()));
      return [...names].filter(Boolean);
    };

    let companies = extractNames(allRaw);

    if (companies.length === 0) {
      companies = [...new Set(xmlVals(allRaw, 'NAME').map(n => n.trim()).filter(Boolean))];
    }

    if (companies.length === 0) {
      return res.status(200).json({
        companies: [],
        _debug: [
          { label: 'ERP9', snippet: erp9Raw.substring(0, 600) },
          { label: 'Prime', snippet: primeRaw.substring(0, 600) },
        ]
      });
    }

    res.json({ companies });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/tally/rawdebug
router.get('/rawdebug', async (_req, res) => {
  try {
    const cfg = readTallyJson(TALLY_CONFIG_FILE, { host: 'localhost', port: 9000 });
    const erp9Xml = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>EpsCoList</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="EpsCoList" ISMODIFY="No" ISFIXED="No" ISOPTION="No" ISINTERNAL="No"><TYPE>Company</TYPE><FETCH>Name</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
    const raw = await tallyRequest(cfg.host, cfg.port, erp9Xml);
    res.type('text/plain').send(raw);
  } catch (err) { res.status(500).send(err.message); }
});

// POST /api/tally/fetch
router.post('/fetch', async (req, res) => {
  try {
    const { tallyCompany, dataTypes = ['debtors', 'creditors'], companyId } = req.body;
    if (!tallyCompany) return res.status(400).json({ error: 'tallyCompany is required' });
    if (!companyId) return res.status(400).json({ error: 'companyId is required' });

    const cfg      = readTallyJson(TALLY_CONFIG_FILE, { host: 'localhost', port: 9000 });
    const snapshot = readTallyJson(TALLY_SNAPSHOT_FILE, {});
    const items    = [];

    const wantDebtors   = dataTypes.includes('debtors');
    const wantCreditors = dataTypes.includes('creditors');

    if (wantDebtors || wantCreditors) {
      const ledgerXml = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>EpsLedgers</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><SVCURRENTCOMPANY>${tallyCompany}</SVCURRENTCOMPANY></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="EpsLedgers" ISMODIFY="No" ISFIXED="No" ISOPTION="No" ISINTERNAL="No"><TYPE>Ledger</TYPE><FETCH>Name,Parent,Address,GSTIN,PartyGSTIN,Email,LedgerPhone,PinCode,LedgerPinCode,LedgerStateName,StateName,OpeningBalance</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
      const raw = await tallyRequest(cfg.host, cfg.port, ledgerXml);

      for (const block of xmlBlocks(raw, 'LEDGER')) {
        const name   = xmlAttr(block, 'NAME') || xmlVal(block, 'NAME');
        const parent = xmlVal(block, 'PARENT');
        if (!name) continue;

        const isDebtor   = parent.toLowerCase().includes('sundry debtor');
        const isCreditor = parent.toLowerCase().includes('sundry creditor');
        if (!isDebtor && !isCreditor) continue;
        if (isDebtor && !wantDebtors) continue;
        if (isCreditor && !wantCreditors) continue;

        const targetType      = isDebtor ? 'client' : 'vendor';
        const addresses       = xmlVals(block, 'ADDRESS').filter(Boolean);
        const uniqueAddresses = [...new Set(addresses.map(a => a.trim()).filter(Boolean))];
        const gstin           = xmlVal(block, 'GSTIN') || xmlVal(block, 'PARTYGSTIN');
        const email           = xmlVal(block, 'EMAIL');
        const phone           = xmlVal(block, 'LEDGERPHONE') || xmlVal(block, 'PHONE');
        const pincode         = xmlVal(block, 'PINCODE') || xmlVal(block, 'LEDGERPINCODE');
        const state           = xmlVal(block, 'LEDGERSTATENAME') || xmlVal(block, 'STATENAME');
        const openingBal      = parseFloat(xmlVal(block, 'OPENINGBALANCE')) || 0;

        const data        = { companyName: name, address: uniqueAddresses.join(', '), gstin, email, phone, pincode, state, openingBalance: openingBal, tallyParent: parent };
        const checksum    = makeChecksum(data);
        const snapshotKey = `${companyId}::${tallyCompany}::${name}`;
        const prevSnap    = snapshot[snapshotKey];
        const existsInERP = erpRecordExists(companyId, targetType, name);

        let changeType;
        if (!existsInERP)                           changeType = 'new';
        else if (!prevSnap)                         changeType = 'new';
        else if (prevSnap.checksum === checksum)    { continue; }
        else                                        changeType = 'modified';

        items.push({
          id: crypto.randomUUID ? crypto.randomUUID() : uuidv4(),
          tallyCompany, companyId,
          tallyType: isDebtor ? 'Debtor' : 'Creditor',
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

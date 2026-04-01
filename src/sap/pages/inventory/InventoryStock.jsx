/**
 * SAP MODE — Inventory Stock Register
 */
import React, { useState, useEffect } from 'react';
import { useSAP } from '../../context/SAPContext';
import { Panel, Table, PageHeader, Input, C, fmtDate } from '../../components/SAPShared';

export default function InventoryStock() {
  const { api } = useSAP();
  const [list,    setList]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [selected,setSelected]= useState(null);

  useEffect(() => {
    api('/api/sap/grn/inventory').then(r => { setList(r.data || []); setLoading(false); }).catch(() => setLoading(false));
  }, [api]);

  const filtered = list.filter(i => {
    const q = search.toLowerCase();
    return !q || i.itemName?.toLowerCase().includes(q);
  });

  return (
    <div style={{ fontFamily: C.font, color: C.text }}>
      <PageHeader tcode="MB52" title="Warehouse Stocks of Material" sub="MM — Inventory Management" />

      <div style={{ padding: '12px 20px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ width: 280 }}>
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items…" />
        </div>
      </div>

      <div style={{ padding: '12px 20px', display: 'grid', gridTemplateColumns: selected ? '1fr 360px' : '1fr', gap: 14 }}>
        <Panel>
          <Table
            cols={[
              { label: 'Item Name',    key: 'itemName' },
              { label: 'Unit',         key: 'unit', muted: true },
              { label: 'Total Stock',  render: r => <span style={{ color: r.totalStock > 0 ? C.green : C.red, fontWeight: 700 }}>{r.totalStock || 0}</span>, right: true },
              { label: 'Transactions', render: r => (r.transactions || []).length, right: true, muted: true },
            ]}
            rows={filtered}
            onRow={r => setSelected(r === selected ? null : r)}
            emptyMsg={loading ? 'Loading…' : 'No inventory records'}
          />
        </Panel>

        {selected && (
          <Panel title={`Ledger: ${selected.itemName}`} action={<button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 16 }}>✕</button>}>
            <div style={{ marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: C.muted }}>Total Stock: </span>
              <span style={{ fontSize: 16, fontWeight: 700, color: selected.totalStock > 0 ? C.green : C.red }}>{selected.totalStock || 0} {selected.unit}</span>
            </div>
            <Table
              cols={[
                { label: 'Type',      key: 'type' },
                { label: 'Qty',       render: r => <span style={{ color: r.qty > 0 ? C.green : C.red, fontWeight: 600 }}>{r.qty > 0 ? '+' : ''}{r.qty}</span>, right: true },
                { label: 'Date',      render: r => fmtDate(r.date), muted: true },
                { label: 'Ref',       key: 'reference', muted: true },
              ]}
              rows={(selected.transactions || []).slice().reverse()}
              emptyMsg="No transactions"
            />
          </Panel>
        )}
      </div>
    </div>
  );
}

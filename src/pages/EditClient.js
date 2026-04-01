import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { printClientDetails } from '../utils/printClient';

const EditClient = () => {
  const { clientId } = useParams();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    companyName: '', address: '', city: '', state: '', pincode: '', gstin: '', gstType: 'Regular'
  });
  const [contactPersons, setContactPersons] = useState([]);
  // Each doc: { name, fileName, newFile, replaceMode }
  const [documents, setDocuments] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [clientStatus, setClientStatus] = useState('');

  const states = ['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal'];

  useEffect(() => { fetchClientData(); }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchClientData = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/clients/${clientId}`);
      const client = response.data;
      setFormData({
        companyName: client.companyName || '',
        address: client.address || '',
        city: client.city || '',
        state: client.state || '',
        pincode: client.pincode || '',
        gstin: client.gstin || '',
        gstType: client.gstType || 'Regular'
      });
      setContactPersons(client.contactPersons || [{ id: 1, name: '', mobileNumber: '', email: '', designation: '' }]);
      setDocuments((client.documents || []).map(d => ({
        name: d.name || '',
        fileName: d.fileName || null,
        newFile: null,
        replaceMode: false
      })));
      setClientStatus(client.status || 'draft');
    } catch (error) {
      setMessage('Error fetching client data: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleContactChange = (index, field, value) => {
    setContactPersons(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const addContactPerson = () => {
    const newId = Math.max(...contactPersons.map(c => c.id || 0), 0) + 1;
    setContactPersons(prev => [...prev, { id: newId, name: '', mobileNumber: '', email: '', designation: '' }]);
  };

  const deleteContactPerson = (index) => {
    if (contactPersons.length === 1) { setMessage('At least one contact person is required'); return; }
    setContactPersons(prev => prev.filter((_, i) => i !== index));
  };

  // Document helpers
  const updateDocName = (index, value) => {
    setDocuments(prev => prev.map((d, i) => i === index ? { ...d, name: value } : d));
  };

  const startReplace = (index) => {
    setDocuments(prev => prev.map((d, i) => i === index ? { ...d, replaceMode: true, newFile: null } : d));
  };

  const cancelReplace = (index) => {
    setDocuments(prev => prev.map((d, i) => i === index ? { ...d, replaceMode: false, newFile: null } : d));
  };

  const setNewFile = (index, file) => {
    setDocuments(prev => prev.map((d, i) => i === index ? { ...d, newFile: file } : d));
  };

  const deleteDocument = (index) => {
    setDocuments(prev => prev.filter((_, i) => i !== index));
  };

  const addDocument = () => {
    setDocuments(prev => [...prev, { name: '', fileName: null, newFile: null, replaceMode: false }]);
  };

  const submitForm = async (status) => {
    try {
      setLoading(true);
      setMessage('');

      if (!formData.companyName || !formData.address || !formData.city || !formData.state || !formData.pincode) {
        setMessage('Please fill all required fields');
        setLoading(false);
        return;
      }

      const fd = new FormData();
      fd.append('companyName', formData.companyName);
      fd.append('address', formData.address);
      fd.append('city', formData.city);
      fd.append('state', formData.state);
      fd.append('pincode', formData.pincode);
      fd.append('gstin', formData.gstin);
      fd.append('gstType', formData.gstType);
      fd.append('status', status);
      fd.append('contactPersons', JSON.stringify(contactPersons.filter(c => c.name)));

      // Build the JSON doc list: existing kept docs + pending-replace docs (replace started but no file chosen)
      const keepDocs = documents
        .filter(d => !d.newFile)
        .map(d => ({ name: d.name, ...(d.fileName ? { fileName: d.fileName } : {}) }));

      fd.append('documents', JSON.stringify(keepDocs));

      // Docs that have a new file selected — upload them
      const uploadDocs = documents.filter(d => d.newFile);
      fd.append('fileNames', JSON.stringify(uploadDocs.map(d => d.name)));
      uploadDocs.forEach(d => fd.append('newFiles', d.newFile));

      await axios.put(`/api/clients/${clientId}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });

      setMessage('✓ Client updated successfully!');
      setClientStatus(status);
      setTimeout(() => navigate('/view-clients'), 1500);
    } catch (error) {
      setMessage('Error updating client: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    printClientDetails({ ...formData, clientId, status: clientStatus, contactPersons, documents });
  };

  if (loading) return <div className="loading">Loading client data...</div>;

  return (
    <div className="form-container">
      <div className="form-title-row">
        <h2 className="form-title" style={{ margin: 0 }}>Edit Client — ID: {clientId}</h2>
        <button className="print-btn-lg" onClick={handlePrint}>🖨️ Print Details</button>
      </div>

      {message && (
        <div className={message.includes('Error') ? 'error-message' : 'success-message'}>{message}</div>
      )}

      {/* Company Info */}
      <div className="form-section">
        <h3 className="section-title">Company Information</h3>
        <div className="form-row">
          <div className="form-group">
            <label>Company Name *</label>
            <input type="text" name="companyName" value={formData.companyName} onChange={handleInputChange} />
          </div>
          <div className="form-group">
            <label>Address *</label>
            <input type="text" name="address" value={formData.address} onChange={handleInputChange} />
          </div>
        </div>
        <div className="form-row three">
          <div className="form-group">
            <label>City *</label>
            <input type="text" name="city" value={formData.city} onChange={handleInputChange} />
          </div>
          <div className="form-group">
            <label>State *</label>
            <select name="state" value={formData.state} onChange={handleInputChange}>
              <option value="">Select State</option>
              {states.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Pincode *</label>
            <input type="text" name="pincode" value={formData.pincode} onChange={handleInputChange} maxLength="6" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>GSTIN</label>
            <input type="text" name="gstin" value={formData.gstin} onChange={handleInputChange} maxLength="15" />
          </div>
          <div className="form-group">
            <label>GST Type</label>
            <select name="gstType" value={formData.gstType} onChange={handleInputChange}>
              <option value="Regular">Regular</option>
              <option value="Composition">Composition</option>
              <option value="Unregistered">Unregistered</option>
            </select>
          </div>
        </div>
      </div>

      {/* Contact Persons */}
      <div className="form-section">
        <h3 className="section-title">Contact Persons</h3>
        {contactPersons.map((contact, index) => (
          <div key={index} className="contact-item">
            <div className="contact-item-header">
              <span className="contact-item-title">Contact Person {index + 1}</span>
              {contactPersons.length > 1 && (
                <button type="button" className="delete-btn" onClick={() => deleteContactPerson(index)}>Delete</button>
              )}
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Name</label>
                <input type="text" value={contact.name || ''} onChange={(e) => handleContactChange(index, 'name', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Mobile Number</label>
                <input type="tel" value={contact.mobileNumber || ''} onChange={(e) => handleContactChange(index, 'mobileNumber', e.target.value)} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={contact.email || ''} onChange={(e) => handleContactChange(index, 'email', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Designation</label>
                <input type="text" value={contact.designation || ''} onChange={(e) => handleContactChange(index, 'designation', e.target.value)} />
              </div>
            </div>
          </div>
        ))}
        <button type="button" className="add-button" onClick={addContactPerson}>➕ Add Contact Person</button>
      </div>

      {/* Documents */}
      <div className="form-section">
        <h3 className="section-title">Documents</h3>

        {documents.length === 0 && (
          <p style={{ color: '#999', fontSize: '14px', marginBottom: '12px' }}>No documents. Click below to add one.</p>
        )}

        {documents.map((doc, index) => (
          <div key={index} className="doc-edit-item">
            {/* Document Name */}
            <div className="doc-edit-name">
              <input
                type="text"
                className="doc-name-input"
                value={doc.name}
                onChange={(e) => updateDocName(index, e.target.value)}
                placeholder="Document name (e.g. GST Certificate)"
              />
            </div>

            {/* File section */}
            <div className="doc-edit-file">
              {doc.fileName && !doc.replaceMode ? (
                <>
                  <span className="doc-attached-badge">📎 File attached</span>
                  <a
                    href={`/api/clients/${clientId}/download/${doc.fileName}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="doc-download-link"
                  >
                    ⬇️ Download
                  </a>
                  <button type="button" className="replace-file-btn" onClick={() => startReplace(index)}>
                    🔄 Replace
                  </button>
                </>
              ) : doc.replaceMode ? (
                <>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    onChange={(e) => setNewFile(index, e.target.files[0])}
                    className="doc-file-input"
                  />
                  {doc.newFile && <span className="doc-new-badge">✓ {doc.newFile.name}</span>}
                  <button type="button" className="cancel-replace-btn" onClick={() => cancelReplace(index)}>
                    ✕ Cancel
                  </button>
                </>
              ) : (
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  onChange={(e) => setNewFile(index, e.target.files[0])}
                  className="doc-file-input"
                />
              )}
            </div>

            {/* Delete */}
            <button type="button" className="delete-btn" onClick={() => deleteDocument(index)}>Delete</button>
          </div>
        ))}

        <button type="button" className="add-button" onClick={addDocument}>➕ Add Document</button>
      </div>

      <div className="form-actions">
        <button type="button" className="cancel-btn" onClick={() => navigate('/view-clients')}>Cancel</button>
        <button type="button" className="draft-btn" onClick={() => submitForm('draft')} disabled={loading}>Save as Draft</button>
        <button type="button" className="submit-btn" onClick={() => submitForm('pending')} disabled={loading}>Save & Submit for Approval</button>
      </div>
    </div>
  );
};

export default EditClient;

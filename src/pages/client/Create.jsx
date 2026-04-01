import React, { useState } from 'react';
import axios from 'axios';

const CreateClient = () => {
  const [formData, setFormData] = useState({
    companyName: '', address: '', city: '', state: '', pincode: '', gstin: '', gstType: 'Regular'
  });
  const [contactPersons, setContactPersons] = useState([
    { id: 1, name: '', mobileNumber: '', email: '', designation: '' }
  ]);
  const [documents, setDocuments] = useState([{ id: 1, name: '', file: null }]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [successModal, setSuccessModal] = useState({ show: false, clientId: null, status: '' });

  const states = ['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal'];

  const resetForm = () => {
    setFormData({ companyName: '', address: '', city: '', state: '', pincode: '', gstin: '', gstType: 'Regular' });
    setContactPersons([{ id: 1, name: '', mobileNumber: '', email: '', designation: '' }]);
    setDocuments([{ id: 1, name: '', file: null }]);
    setMessage('');
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleContactChange = (id, field, value) => {
    setContactPersons(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const addContactPerson = () => {
    const newId = Math.max(...contactPersons.map(c => c.id), 0) + 1;
    setContactPersons(prev => [...prev, { id: newId, name: '', mobileNumber: '', email: '', designation: '' }]);
  };

  const deleteContactPerson = (id) => {
    if (contactPersons.length === 1) { setMessage('At least one contact person is required'); return; }
    setContactPersons(prev => prev.filter(c => c.id !== id));
  };

  const handleDocumentChange = (id, field, value) => {
    setDocuments(prev => prev.map(d => d.id === id ? { ...d, [field]: value } : d));
  };

  const addDocument = () => {
    const newId = Math.max(...documents.map(d => d.id), 0) + 1;
    setDocuments(prev => [...prev, { id: newId, name: '', file: null }]);
  };

  const deleteDocument = (id) => {
    setDocuments(prev => prev.filter(d => d.id !== id));
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

      const docMeta = documents.filter(d => d.name).map(d => ({ name: d.name }));
      fd.append('documents', JSON.stringify(docMeta));
      documents.forEach(doc => { if (doc.file) fd.append('documents', doc.file); });

      const response = await axios.post('/api/clients', fd, { headers: { 'Content-Type': 'multipart/form-data' } });

      setSuccessModal({ show: true, clientId: response.data.clientId, status });
    } catch (error) {
      setMessage('Error creating client: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleModalClose = () => {
    setSuccessModal({ show: false, clientId: null, status: '' });
    resetForm();
  };

  return (
    <>
      {successModal.show && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-success-icon">✓</div>
            <h3 className="modal-title">Client Created Successfully!</h3>
            <div className="modal-client-id">
              Client ID: <strong>{successModal.clientId}</strong>
            </div>
            <p className="modal-status">
              Status: <span className={`status-badge ${successModal.status === 'pending' ? 'status-pending' : 'status-draft'}`}>
                {successModal.status === 'pending' ? 'Submitted for Approval' : 'Saved as Draft'}
              </span>
            </p>
            <button className="modal-ok-btn" onClick={handleModalClose}>OK — Create Another</button>
          </div>
        </div>
      )}

      <div style={{padding:'10px'}}>
      <div className="form-container">
        <h2 className="form-title">Create New Client</h2>

        {message && (
          <div className={message.includes('Error') ? 'error-message' : 'success-message'}>{message}</div>
        )}

        <div className="form-section">
          <h3 className="section-title">Company Information</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Company Name *</label>
              <input type="text" name="companyName" value={formData.companyName} onChange={handleInputChange} placeholder="Enter company name" />
            </div>
            <div className="form-group">
              <label>Address *</label>
              <input type="text" name="address" value={formData.address} onChange={handleInputChange} placeholder="Enter street address" />
            </div>
          </div>
          <div className="form-row three">
            <div className="form-group">
              <label>City *</label>
              <input type="text" name="city" value={formData.city} onChange={handleInputChange} placeholder="Enter city" />
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
              <input type="text" name="pincode" value={formData.pincode} onChange={handleInputChange} placeholder="Enter pincode" maxLength="6" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>GSTIN</label>
              <input type="text" name="gstin" value={formData.gstin} onChange={handleInputChange} placeholder="Enter GSTIN" maxLength="15" />
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

        <div className="form-section">
          <h3 className="section-title">Contact Persons</h3>
          {contactPersons.map(contact => (
            <div key={contact.id} className="contact-item">
              <div className="contact-item-header">
                <span className="contact-item-title">Contact Person {contact.id}</span>
                {contactPersons.length > 1 && (
                  <button type="button" className="delete-btn" onClick={() => deleteContactPerson(contact.id)}>Delete</button>
                )}
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Name</label>
                  <input type="text" value={contact.name} onChange={(e) => handleContactChange(contact.id, 'name', e.target.value)} placeholder="Enter name" />
                </div>
                <div className="form-group">
                  <label>Mobile Number</label>
                  <input type="tel" value={contact.mobileNumber} onChange={(e) => handleContactChange(contact.id, 'mobileNumber', e.target.value)} placeholder="Enter mobile number" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" value={contact.email} onChange={(e) => handleContactChange(contact.id, 'email', e.target.value)} placeholder="Enter email" />
                </div>
                <div className="form-group">
                  <label>Designation</label>
                  <input type="text" value={contact.designation} onChange={(e) => handleContactChange(contact.id, 'designation', e.target.value)} placeholder="Enter designation" />
                </div>
              </div>
            </div>
          ))}
          <button type="button" className="add-button" onClick={addContactPerson}>➕ Add Contact Person</button>
        </div>

        <div className="form-section">
          <h3 className="section-title">Documents</h3>
          {documents.map(doc => (
            <div key={doc.id} className="form-row full">
              <div className="form-group">
                <label>Document Name</label>
                <input type="text" value={doc.name} onChange={(e) => handleDocumentChange(doc.id, 'name', e.target.value)} placeholder="e.g., Certificate of Incorporation" />
              </div>
              <div className="form-group">
                <label>Attach File</label>
                <div className="file-input-wrapper">
                  <input type="file" onChange={(e) => handleDocumentChange(doc.id, 'file', e.target.files[0])} accept=".pdf,.doc,.docx,.jpg,.png" />
                  {documents.length > 1 && (
                    <button type="button" className="delete-btn" onClick={() => deleteDocument(doc.id)}>Remove</button>
                  )}
                </div>
              </div>
            </div>
          ))}
          <button type="button" className="add-button" onClick={addDocument}>➕ Add Document</button>
        </div>

        <div className="form-actions">
          <button type="button" className="draft-btn" onClick={() => submitForm('draft')} disabled={loading}>
            {loading ? 'Processing...' : 'Save as Draft'}
          </button>
          <button type="button" className="submit-btn" onClick={() => submitForm('pending')} disabled={loading}>
            {loading ? 'Processing...' : 'Save & Submit for Approval'}
          </button>
        </div>
      </div>
      </div>
    </>
  );
};

export default CreateClient;

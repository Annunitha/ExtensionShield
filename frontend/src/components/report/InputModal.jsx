import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import './InputModal.scss';

/**
 * InputModal - Modal showing detailed input information and configuration
 * 
 * Props:
 * - open: boolean
 * - onClose: () => void
 * - inputType: 'url' | 'file' | 'extension_id'
 * - inputValue: string - The current input value
 * - inputMetadata: object - Additional metadata about the input
 *   - extensionId: string
 *   - extensionName: string
 *   - source: string
 *   - timestamp: string
 *   - fileSize: number (for file uploads)
 *   - fileType: string (for file uploads)
 * - validationStatus: 'valid' | 'invalid' | 'pending'
 * - validationErrors: string[]
 * - onInputChange: (value: string) => void
 * - onValidate: () => void
 */
const InputModal = ({
  open,
  onClose,
  inputType = 'url',
  inputValue = '',
  inputMetadata = {},
  validationStatus = 'pending',
  validationErrors = [],
  onInputChange = null,
  onValidate = null,
}) => {
  const [expandedSection, setExpandedSection] = useState('details');

  const getInputTypeInfo = () => {
    const types = {
      url: {
        title: 'URL Input',
        icon: '🔗',
        description: 'Chrome Web Store URL input details and validation status.',
        color: '#3B82F6',
      },
      file: {
        title: 'File Upload',
        icon: '📁',
        description: 'Extension file upload details and processing status.',
        color: '#8B5CF6',
      },
      extension_id: {
        title: 'Extension ID',
        icon: '🆔',
        description: 'Direct extension ID input and lookup information.',
        color: 'var(--risk-good)',
      },
    };
    return types[inputType] || types.url;
  };

  const inputInfo = getInputTypeInfo();

  const getValidationStatusColor = () => {
    switch (validationStatus) {
      case 'valid': return 'var(--risk-good)';
      case 'invalid': return 'var(--risk-bad)';
      case 'pending': return 'var(--risk-warn)';
      default: return 'var(--risk-neutral)';
    }
  };

  const getValidationStatusLabel = () => {
    switch (validationStatus) {
      case 'valid': return 'Valid';
      case 'invalid': return 'Invalid';
      case 'pending': return 'Validating';
      default: return 'Unknown';
    }
  };

  const toggleSection = (section) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="input-modal-content">
        <DialogHeader>
          <DialogTitle className="input-modal-title">
            <span className="title-icon">{inputInfo.icon}</span>
            <span className="title-text">{inputInfo.title} Details</span>
            <div className="title-status">
              <span 
                className="title-status-badge" 
                style={{ color: getValidationStatusColor() }}
              >
                {getValidationStatusLabel()}
              </span>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="input-modal-body">
          {/* Input Description */}
          <p className="input-description">{inputInfo.description}</p>

          {/* Input Details */}
          <div className="modal-section">
            <div 
              className="section-header"
              onClick={() => toggleSection('details')}
            >
              <h3 className="section-title">
                <span className="section-icon">📋</span>
                Input Details
              </h3>
              <span className={`expand-icon ${expandedSection === 'details' ? 'expanded' : ''}`}>
                ›
              </span>
            </div>
            {expandedSection === 'details' && (
              <div className="section-content">
                <div className="input-details-grid">
                  <div className="detail-item">
                    <span className="detail-label">Input Type:</span>
                    <span className="detail-value">{inputType}</span>
                  </div>
                  {inputMetadata.extensionId && (
                    <div className="detail-item">
                      <span className="detail-label">Extension ID:</span>
                      <span className="detail-value">{inputMetadata.extensionId}</span>
                    </div>
                  )}
                  {inputMetadata.extensionName && (
                    <div className="detail-item">
                      <span className="detail-label">Extension Name:</span>
                      <span className="detail-value">{inputMetadata.extensionName}</span>
                    </div>
                  )}
                  {inputMetadata.source && (
                    <div className="detail-item">
                      <span className="detail-label">Source:</span>
                      <span className="detail-value">{inputMetadata.source}</span>
                    </div>
                  )}
                  {inputMetadata.timestamp && (
                    <div className="detail-item">
                      <span className="detail-label">Timestamp:</span>
                      <span className="detail-value">
                        {new Date(inputMetadata.timestamp).toLocaleString()}
                      </span>
                    </div>
                  )}
                  {inputMetadata.fileSize && (
                    <div className="detail-item">
                      <span className="detail-label">File Size:</span>
                      <span className="detail-value">
                        {(inputMetadata.fileSize / 1024).toFixed(2)} KB
                      </span>
                    </div>
                  )}
                  {inputMetadata.fileType && (
                    <div className="detail-item">
                      <span className="detail-label">File Type:</span>
                      <span className="detail-value">{inputMetadata.fileType}</span>
                    </div>
                  )}
                </div>
                {inputValue && (
                  <div className="input-value-display">
                    <span className="value-label">Input Value:</span>
                    <code className="value-code">{inputValue}</code>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Validation Status */}
          <div className="modal-section">
            <div 
              className="section-header"
              onClick={() => toggleSection('validation')}
            >
              <h3 className="section-title">
                <span className="section-icon">✓</span>
                Validation Status
              </h3>
              <span className={`expand-icon ${expandedSection === 'validation' ? 'expanded' : ''}`}>
                ›
              </span>
            </div>
            {expandedSection === 'validation' && (
              <div className="section-content">
                <div className="validation-status-display">
                  <div 
                    className="status-indicator"
                    style={{ backgroundColor: getValidationStatusColor() }}
                  >
                    {getValidationStatusLabel()}
                  </div>
                  {validationErrors.length > 0 && (
                    <ul className="validation-errors-list">
                      {validationErrors.map((error, idx) => (
                        <li key={idx} className="error-item">
                          <span className="error-icon">⚠️</span>
                          <span className="error-text">{error}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {validationStatus === 'valid' && validationErrors.length === 0 && (
                    <p className="validation-success">
                      ✓ Input is valid and ready for processing
                    </p>
                  )}
                </div>
                {onValidate && (
                  <button
                    className="validate-button"
                    onClick={onValidate}
                  >
                    Re-validate Input
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Input Actions */}
          {onInputChange && (
            <div className="modal-section">
              <div 
                className="section-header"
                onClick={() => toggleSection('actions')}
              >
                <h3 className="section-title">
                  <span className="section-icon">⚙️</span>
                  Input Actions
                </h3>
                <span className={`expand-icon ${expandedSection === 'actions' ? 'expanded' : ''}`}>
                  ›
                </span>
              </div>
              {expandedSection === 'actions' && (
                <div className="section-content">
                  <div className="input-actions-grid">
                    <button
                      className="action-button"
                      onClick={() => {
                        if (onInputChange) {
                          onInputChange('');
                        }
                      }}
                    >
                      Clear Input
                    </button>
                    <button
                      className="action-button"
                      onClick={() => {
                        if (inputValue && navigator.clipboard) {
                          navigator.clipboard.writeText(inputValue);
                        }
                      }}
                    >
                      Copy to Clipboard
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default InputModal;



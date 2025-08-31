import CryptoJS from 'crypto-js';

export interface MifieldConfig {
  appId: string;
  appSecret: string;
  baseUrl: string;
  sandboxMode?: boolean;
}

export interface DocumentSigner {
  name: string;
  email: string;
  taxId: string; // RFC in Mexico
  phone?: string;
}

export interface DocumentSignData {
  name: string;
  hash: string; // SHA256 hash of the document
  signers: DocumentSigner[];
  callbackUrl?: string;
  expiresAt?: Date;
  metadata?: Record<string, any>;
}

export interface MifieldDocument {
  id: string;
  original_hash: string;
  name: string;
  created_at: string;
  signed: boolean;
  signed_at?: string;
  signed_by_all: boolean;
  status: 'pending' | 'signed' | 'cancelled' | 'expired';
  file_signed_url?: string;
  file_signed_hash?: string;
  signers: MifieldSigner[];
  callback_url?: string;
  expires_at?: string;
  metadata?: Record<string, any>;
}

export interface MifieldSigner {
  id: string;
  email: string;
  name: string;
  tax_id: string;
  signed: boolean;
  signed_at?: string;
  signature_id?: string;
  certificate?: MifieldCertificate;
  widget_id?: string;
}

export interface MifieldCertificate {
  cer: string;
  type_of: string;
  serial_number: string;
  sat_certificate: boolean;
  subject: string;
  issuer: string;
  not_before: string;
  not_after: string;
}

export interface SigningWidget {
  id: string;
  document_id: string;
  signer_id: string;
  status: 'pending' | 'completed' | 'expired' | 'cancelled';
  url?: string;
  iframe_url?: string;
  expires_at: string;
  signed_at?: string;
}

export interface DocumentStatus {
  id: string;
  name: string;
  status: 'pending' | 'signed' | 'cancelled' | 'expired';
  signed: boolean;
  signed_by_all: boolean;
  created_at: string;
  signed_at?: string;
  expires_at?: string;
  signers_status: Array<{
    email: string;
    name: string;
    signed: boolean;
    signed_at?: string;
  }>;
}

export interface WebhookEvent {
  id: string;
  type: 'document.signed' | 'document.signed_by_all' | 'document.cancelled' | 'document.expired';
  created_at: string;
  data: {
    document: MifieldDocument;
    signer?: MifieldSigner;
  };
}

class MifieldService {
  private config: MifieldConfig;

  constructor(config: MifieldConfig) {
    this.config = config;
    
    // Use sandbox URL if in sandbox mode
    if (config.sandboxMode) {
      this.config.baseUrl = 'https://sandbox.mifiel.com/api/v1';
    }
  }

  private getAuthHeaders(): Record<string, string> {
    const auth = btoa(`${this.config.appId}:${this.config.appSecret}`);
    return {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'ConductoresMundo-PWA/1.0'
    };
  }

  private async makeRequest<T>(
    endpoint: string, 
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', 
    data?: any
  ): Promise<T> {
    try {
      const response = await fetch(`${this.config.baseUrl}${endpoint}`, {
        method,
        headers: this.getAuthHeaders(),
        body: data ? JSON.stringify(data) : undefined
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Mifiel API Error ${response.status}: ${errorData.message || response.statusText}`);
      }

      return response.json();
    } catch (error) {
      console.error(`Mifiel API request failed (${method} ${endpoint}):`, error);
      throw error;
    }
  }

  async createDocument(documentData: DocumentSignData): Promise<MifieldDocument> {
    const expiresAt = documentData.expiresAt ? 
      Math.floor(documentData.expiresAt.getTime() / 1000) : 
      undefined;

    const payload = {
      original_hash: documentData.hash,
      name: documentData.name,
      signers: documentData.signers.map(signer => ({
        name: signer.name,
        email: signer.email,
        tax_id: signer.taxId,
        phone: signer.phone
      })),
      callback_url: documentData.callbackUrl,
      expires_at: expiresAt,
      metadata: documentData.metadata
    };

    return this.makeRequest<MifieldDocument>('/documents', 'POST', payload);
  }

  async getDocument(documentId: string): Promise<MifieldDocument> {
    return this.makeRequest<MifieldDocument>(`/documents/${documentId}`);
  }

  async getDocumentStatus(documentId: string): Promise<DocumentStatus> {
    const document = await this.getDocument(documentId);
    
    return {
      id: document.id,
      name: document.name,
      status: document.status,
      signed: document.signed,
      signed_by_all: document.signed_by_all,
      created_at: document.created_at,
      signed_at: document.signed_at,
      expires_at: document.expires_at,
      signers_status: document.signers.map(signer => ({
        email: signer.email,
        name: signer.name,
        signed: signer.signed,
        signed_at: signer.signed_at
      }))
    };
  }

  async getDocumentList(limit = 50, page = 1): Promise<{
    documents: MifieldDocument[];
    total: number;
    page: number;
    has_more: boolean;
  }> {
    const response = await this.makeRequest<any>(`/documents?limit=${limit}&page=${page}`);
    
    return {
      documents: response.data || response,
      total: response.total || response.length,
      page: page,
      has_more: response.has_more || false
    };
  }

  async downloadSignedDocument(documentId: string): Promise<Blob> {
    try {
      const response = await fetch(`${this.config.baseUrl}/documents/${documentId}/file`, {
        headers: this.getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error(`Failed to download document: ${response.status} ${response.statusText}`);
      }

      return response.blob();
    } catch (error) {
      console.error('Failed to download signed document:', error);
      throw error;
    }
  }

  async downloadSignedDocumentAsBase64(documentId: string): Promise<string> {
    const blob = await this.downloadSignedDocument(documentId);
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix to get just base64
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  async cancelDocument(documentId: string, reason?: string): Promise<MifieldDocument> {
    const payload = reason ? { reason } : {};
    return this.makeRequest<MifieldDocument>(`/documents/${documentId}/cancel`, 'PUT', payload);
  }

  // Widget management for embedded signing
  async createSigningWidget(documentId: string, signerId: string): Promise<SigningWidget> {
    return this.makeRequest<SigningWidget>(`/documents/${documentId}/signers/${signerId}/widget`, 'POST');
  }

  async getSigningWidget(widgetId: string): Promise<SigningWidget> {
    return this.makeRequest<SigningWidget>(`/widgets/${widgetId}`);
  }

  async getSigningWidgetForSigner(documentId: string, signerEmail: string): Promise<SigningWidget | null> {
    try {
      const document = await this.getDocument(documentId);
      const signer = document.signers.find(s => s.email === signerEmail);
      
      if (!signer || !signer.widget_id) {
        return null;
      }

      return this.getSigningWidget(signer.widget_id);
    } catch (error) {
      console.error('Failed to get signing widget for signer:', error);
      return null;
    }
  }

  // Template management (if available)
  async createTemplate(name: string, content: string, fields: any[]): Promise<any> {
    const payload = {
      name,
      content,
      fields
    };

    return this.makeRequest<any>('/templates', 'POST', payload);
  }

  async getTemplates(): Promise<any[]> {
    const response = await this.makeRequest<any>('/templates');
    return response.data || response;
  }

  async createDocumentFromTemplate(templateId: string, signers: DocumentSigner[], values: Record<string, any>): Promise<MifieldDocument> {
    const payload = {
      template_id: templateId,
      signers: signers.map(signer => ({
        name: signer.name,
        email: signer.email,
        tax_id: signer.taxId,
        phone: signer.phone
      })),
      values
    };

    return this.makeRequest<MifieldDocument>('/documents/from_template', 'POST', payload);
  }

  // Certificate validation
  async validateCertificate(certificateData: string): Promise<{
    valid: boolean;
    certificate: MifieldCertificate;
    errors?: string[];
  }> {
    const payload = {
      certificate: certificateData
    };

    return this.makeRequest<any>('/certificates/validate', 'POST', payload);
  }

  // Webhook handling
  async handleWebhook(payload: WebhookEvent, signature?: string): Promise<{
    type: string;
    documentId: string;
    signerEmail?: string;
    status: string;
    allSigned: boolean;
    metadata?: Record<string, any>;
  }> {
    // Basic webhook signature validation (if implemented)
    if (signature && this.config.appSecret) {
      const expectedSignature = CryptoJS.HmacSHA256(
        JSON.stringify(payload), 
        this.config.appSecret
      ).toString();

      if (signature !== expectedSignature) {
        throw new Error('Invalid webhook signature');
      }
    }

    const { type, data } = payload;
    const { document, signer } = data;

    const eventData = {
      type,
      documentId: document.id,
      signerEmail: signer?.email,
      status: document.status,
      allSigned: document.signed_by_all,
      metadata: document.metadata
    };

    // Log the event for processing
    console.log(`Mifiel webhook event: ${type} for document ${document.id}`);

    return eventData;
  }

  // Utility methods
  static generateDocumentHash(content: string | ArrayBuffer): string {
    let wordArray;
    
    if (typeof content === 'string') {
      wordArray = CryptoJS.enc.Utf8.parse(content);
    } else {
      const uint8Array = new Uint8Array(content);
      wordArray = CryptoJS.lib.WordArray.create(uint8Array);
    }
    
    return CryptoJS.SHA256(wordArray).toString();
  }

  static async generateDocumentHashFromFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const arrayBuffer = reader.result as ArrayBuffer;
        const hash = MifieldService.generateDocumentHash(arrayBuffer);
        resolve(hash);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  isValidRFC(rfc: string): boolean {
    // Basic RFC validation for Mexican tax IDs
    const rfcRegex = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/;
    return rfcRegex.test(rfc.toUpperCase());
  }

  validateSigners(signers: DocumentSigner[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (signers.length === 0) {
      errors.push('At least one signer is required');
    }

    signers.forEach((signer, index) => {
      if (!signer.name?.trim()) {
        errors.push(`Signer ${index + 1}: Name is required`);
      }

      if (!signer.email || !this.isValidEmail(signer.email)) {
        errors.push(`Signer ${index + 1}: Valid email is required`);
      }

      if (!signer.taxId || !this.isValidRFC(signer.taxId)) {
        errors.push(`Signer ${index + 1}: Valid RFC is required`);
      }
    });

    // Check for duplicate emails
    const emails = signers.map(s => s.email.toLowerCase());
    const duplicates = emails.filter((email, index) => emails.indexOf(email) !== index);
    if (duplicates.length > 0) {
      errors.push(`Duplicate signer emails found: ${duplicates.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.getDocumentList(1, 1);
      return true;
    } catch (error) {
      console.error('Mifiel connection test failed:', error);
      return false;
    }
  }

  getSigningUrl(documentId: string, signerEmail: string): string {
    // This would typically be provided by the widget or direct signing URL
    return `${this.config.baseUrl.replace('/api/v1', '')}/sign/${documentId}?email=${encodeURIComponent(signerEmail)}`;
  }

  // Helper method to create contracts for different business flows
  async createContractForClient(
    clientId: string,
    clientData: {
      name: string;
      email: string;
      rfc: string;
      phone?: string;
    },
    contractType: 'venta_plazo' | 'venta_directa' | 'plan_ahorro' | 'credito_colectivo',
    contractContent: string | File
  ): Promise<MifieldDocument> {
    let hash: string;
    let documentName: string;

    if (typeof contractContent === 'string') {
      hash = MifieldService.generateDocumentHash(contractContent);
      documentName = `Contrato ${contractType} - ${clientData.name}`;
    } else {
      hash = await MifieldService.generateDocumentHashFromFile(contractContent);
      documentName = contractContent.name;
    }

    const signers: DocumentSigner[] = [
      {
        name: clientData.name,
        email: clientData.email,
        taxId: clientData.rfc,
        phone: clientData.phone
      }
    ];

    const documentData: DocumentSignData = {
      name: documentName,
      hash,
      signers,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      metadata: {
        client_id: clientId,
        contract_type: contractType,
        created_at: new Date().toISOString()
      }
    };

    return this.createDocument(documentData);
  }
}

export default MifieldService;
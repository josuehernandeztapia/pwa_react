import { Client, BusinessFlow, Ecosystem, Quote } from '../../models/types';
import CryptoJS from 'crypto-js';

export interface OdooConfig {
  baseUrl: string;
  database: string;
  username: string;
  password: string;
}

export interface OdooResponse<T = any> {
  jsonrpc: string;
  id: string | number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data: any;
  };
}

export interface OpportunityData {
  name: string;
  partner_name: string;
  email_from?: string;
  phone?: string;
  street?: string;
  city?: string;
  state_id?: number;
  market?: string;
  business_flow?: string;
  stage_id?: number;
}

export interface DocumentData {
  filename: string;
  base64: string;
  mimeType: string;
  description?: string;
}

export interface SavingsPlanData {
  name: string;
  partner_id: number;
  plan_type: string;
  goal_amount: number;
  monthly_contribution: number;
  market: string;
}

export interface PaymentEventData {
  partner_id: number;
  amount: number;
  currency: string;
  payment_method: string;
  reference?: string;
  transaction_id?: string;
  metadata?: any;
}

export interface OCRResult {
  success: boolean;
  extracted_text: string;
  confidence_score: number;
  document_type?: string;
  validation_results?: any;
}

class OdooApiService {
  private config: OdooConfig;
  private sessionId: string | null = null;
  private uid: number | null = null;
  private requestId = 1;

  constructor(config: OdooConfig) {
    this.config = config;
  }

  private getNextRequestId(): number {
    return this.requestId++;
  }

  async authenticate(): Promise<{ sessionId: string; uid: number }> {
    try {
      const response = await fetch(`${this.config.baseUrl}/web/session/authenticate`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'call',
          id: this.getNextRequestId(),
          params: {
            db: this.config.database,
            login: this.config.username,
            password: this.config.password,
          }
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: OdooResponse = await response.json();
      
      if (data.error) {
        throw new Error(`Odoo Authentication Error: ${data.error.message}`);
      }

      if (!data.result || !data.result.session_id || !data.result.uid) {
        throw new Error('Invalid authentication response from Odoo');
      }

      this.sessionId = data.result.session_id;
      this.uid = data.result.uid;
      
      return { sessionId: this.sessionId, uid: this.uid };
    } catch (error) {
      console.error('Odoo authentication failed:', error);
      throw error;
    }
  }

  private async ensureAuthenticated(): Promise<void> {
    if (!this.sessionId || !this.uid) {
      await this.authenticate();
    }
  }

  async callOdoo<T = any>(
    model: string, 
    method: string, 
    args: any[] = [], 
    kwargs: any = {}
  ): Promise<T> {
    await this.ensureAuthenticated();

    try {
      const response = await fetch(`${this.config.baseUrl}/web/dataset/call_kw`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Cookie': `session_id=${this.sessionId}`
        },
        credentials: 'include',
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'call',
          id: this.getNextRequestId(),
          params: {
            model,
            method,
            args,
            kwargs: {
              context: { 
                lang: 'es_MX',
                tz: 'America/Mexico_City',
                uid: this.uid,
                ...kwargs.context
              },
              ...kwargs
            }
          }
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: OdooResponse<T> = await response.json();
      
      if (data.error) {
        throw new Error(`Odoo Error: ${data.error.message}`);
      }

      return data.result as T;
    } catch (error) {
      console.error(`Odoo API call failed (${model}.${method}):`, error);
      throw error;
    }
  }

  // 1. Client Management (10+ endpoints)
  async getClients(market?: string, limit = 100, offset = 0): Promise<Client[]> {
    const domain: any[] = [['is_company', '=', false]];
    if (market) {
      domain.push(['x_market', '=', market]);
    }

    return this.callOdoo('res.partner', 'search_read', [domain], {
      fields: ['name', 'email', 'phone', 'street', 'city', 'state_id', 'x_market', 'x_business_flow', 'x_status'],
      limit,
      offset
    });
  }

  async getClient(clientId: number): Promise<Client> {
    const partners = await this.callOdoo('res.partner', 'read', [[clientId]], {
      fields: ['name', 'email', 'phone', 'street', 'city', 'state_id', 'x_market', 'x_business_flow', 'x_status', 'x_health_score']
    });
    return partners[0];
  }

  async createClient(clientData: Partial<Client>): Promise<number> {
    return this.callOdoo('res.partner', 'create', [{
      name: clientData.name,
      email: clientData.email || false,
      phone: clientData.phone || false,
      street: clientData.street || false,
      city: clientData.city || false,
      x_market: clientData.market || false,
      x_business_flow: clientData.flow || false,
      x_status: clientData.status || 'Nuevas Oportunidades',
      is_company: false
    }]);
  }

  async updateClient(clientId: number, updates: Partial<Client>): Promise<boolean> {
    const data: any = {};
    if (updates.name) data.name = updates.name;
    if (updates.email) data.email = updates.email;
    if (updates.phone) data.phone = updates.phone;
    if (updates.status) data.x_status = updates.status;
    if (updates.healthScore) data.x_health_score = updates.healthScore;

    return this.callOdoo('res.partner', 'write', [[clientId], data]);
  }

  async updateClientStage(clientId: number, stageId: number): Promise<boolean> {
    return this.callOdoo('res.partner', 'write', [[clientId], { stage_id: stageId }]);
  }

  // 2. Opportunity/CRM Management (8+ endpoints)
  async createOpportunity(data: OpportunityData): Promise<number> {
    return this.callOdoo('crm.lead', 'create', [{
      name: data.name,
      partner_name: data.partner_name,
      email_from: data.email_from,
      phone: data.phone,
      street: data.street,
      city: data.city,
      state_id: data.state_id,
      x_market: data.market,
      x_business_flow: data.business_flow,
      stage_id: data.stage_id || 1
    }]);
  }

  async getOpportunities(market?: string): Promise<any[]> {
    const domain: any[] = [];
    if (market) {
      domain.push(['x_market', '=', market]);
    }

    return this.callOdoo('crm.lead', 'search_read', [domain], {
      fields: ['name', 'partner_name', 'email_from', 'phone', 'stage_id', 'x_market', 'x_business_flow', 'create_date']
    });
  }

  async updateOpportunityStage(oppId: number, stageId: number): Promise<boolean> {
    return this.callOdoo('crm.lead', 'write', [[oppId], { stage_id: stageId }]);
  }

  async convertOpportunityToClient(oppId: number): Promise<number> {
    const result = await this.callOdoo('crm.lead', 'convert_opportunity', [[oppId]], {
      partner_id: false,
      close: true
    });
    return result.partner_id;
  }

  // 3. Document Management (12+ endpoints)
  async uploadDocument(clientId: number, docData: DocumentData): Promise<number> {
    return this.callOdoo('ir.attachment', 'create', [{
      name: docData.filename,
      datas: docData.base64,
      res_model: 'res.partner',
      res_id: clientId,
      mimetype: docData.mimeType,
      description: docData.description || ''
    }]);
  }

  async getClientDocuments(clientId: number): Promise<any[]> {
    return this.callOdoo('ir.attachment', 'search_read', [
      [['res_model', '=', 'res.partner'], ['res_id', '=', clientId]]
    ], {
      fields: ['name', 'mimetype', 'create_date', 'description', 'x_document_type', 'x_status']
    });
  }

  async deleteDocument(attachmentId: number): Promise<boolean> {
    return this.callOdoo('ir.attachment', 'unlink', [[attachmentId]]);
  }

  async processOCR(attachmentId: number): Promise<OCRResult> {
    // This would call a custom Odoo addon for OCR processing
    return this.callOdoo('document.ocr', 'process_document', [[attachmentId]]);
  }

  async validateDocument(attachmentId: number, validationParams: any): Promise<any> {
    return this.callOdoo('document.validation', 'validate_document', [[attachmentId]], validationParams);
  }

  async approveDocument(attachmentId: number, approverId: number): Promise<boolean> {
    return this.callOdoo('ir.attachment', 'write', [[attachmentId]], {
      x_status: 'approved',
      x_approved_by: approverId,
      x_approved_date: new Date().toISOString()
    });
  }

  // 4. Financial/Analytics (8+ endpoints)
  async createAnalyticAccount(planData: SavingsPlanData): Promise<number> {
    return this.callOdoo('account.analytic.account', 'create', [{
      name: planData.name,
      partner_id: planData.partner_id,
      x_plan_type: planData.plan_type,
      x_goal_amount: planData.goal_amount,
      x_monthly_contribution: planData.monthly_contribution,
      x_market: planData.market
    }]);
  }

  async registerPaymentEvent(paymentData: PaymentEventData): Promise<number> {
    return this.callOdoo('account.payment', 'create', [{
      partner_id: paymentData.partner_id,
      amount: paymentData.amount,
      currency_id: await this.getCurrencyId(paymentData.currency),
      payment_method_line_id: await this.getPaymentMethodId(paymentData.payment_method),
      ref: paymentData.reference,
      x_transaction_id: paymentData.transaction_id,
      x_metadata: JSON.stringify(paymentData.metadata || {})
    }]);
  }

  async getClientAnalytics(clientId: number): Promise<any> {
    return this.callOdoo('account.analytic.line', 'search_read', [
      [['partner_id', '=', clientId]]
    ], {
      fields: ['date', 'amount', 'name', 'account_id', 'x_transaction_type']
    });
  }

  async createSavingsPlan(clientId: number, planData: any): Promise<number> {
    return this.callOdoo('savings.plan', 'create', [{
      partner_id: clientId,
      goal_amount: planData.goalAmount,
      monthly_contribution: planData.monthlyContribution,
      start_date: planData.startDate,
      market: planData.market
    }]);
  }

  // 5. Quote/Product Management (6+ endpoints)
  async saveQuote(clientId: number, quoteData: Quote): Promise<number> {
    return this.callOdoo('sale.order', 'create', [{
      partner_id: clientId,
      x_total_price: quoteData.totalPrice,
      x_down_payment: quoteData.downPayment,
      x_amount_to_finance: quoteData.amountToFinance,
      x_term_months: quoteData.term,
      x_monthly_payment: quoteData.monthlyPayment,
      x_market: quoteData.market,
      x_client_type: quoteData.clientType,
      x_business_flow: quoteData.flow
    }]);
  }

  async getProductPackage(packageKey: string): Promise<any> {
    return this.callOdoo('product.package', 'get_package_config', [packageKey]);
  }

  async updateQuoteStatus(quoteId: number, status: string): Promise<boolean> {
    return this.callOdoo('sale.order', 'write', [[quoteId], { x_quote_status: status }]);
  }

  // 6. Business Intelligence (7+ endpoints)
  async getExecutiveDashboard(dateFrom?: string, dateTo?: string): Promise<any> {
    return this.callOdoo('business.intelligence', 'get_executive_dashboard', [], {
      date_from: dateFrom,
      date_to: dateTo
    });
  }

  async getPerformanceMetrics(advisorId?: number): Promise<any> {
    return this.callOdoo('performance.metrics', 'get_advisor_metrics', [], {
      advisor_id: advisorId
    });
  }

  async generateReport(reportType: string, parameters: any): Promise<any> {
    return this.callOdoo('report.generator', 'generate_report', [reportType], parameters);
  }

  async getAlerts(severity?: string): Promise<any[]> {
    const domain: any[] = [];
    if (severity) {
      domain.push(['severity', '=', severity]);
    }

    return this.callOdoo('system.alert', 'search_read', [domain], {
      fields: ['message', 'severity', 'create_date', 'resolved', 'client_id']
    });
  }

  // Helper methods
  private async getCurrencyId(currencyCode: string): Promise<number> {
    const currencies = await this.callOdoo('res.currency', 'search_read', [
      [['name', '=', currencyCode]]
    ], { fields: ['id'] });
    return currencies[0]?.id || 1; // Default to first currency if not found
  }

  private async getPaymentMethodId(methodName: string): Promise<number> {
    const methods = await this.callOdoo('account.payment.method.line', 'search_read', [
      [['name', 'ilike', methodName]]
    ], { fields: ['id'] });
    return methods[0]?.id || 1; // Default to first method if not found
  }

  // Connection utilities
  async testConnection(): Promise<boolean> {
    try {
      await this.authenticate();
      // Simple test call
      await this.callOdoo('res.users', 'read', [[this.uid]], { fields: ['name'] });
      return true;
    } catch (error) {
      console.error('Odoo connection test failed:', error);
      return false;
    }
  }

  async getVersion(): Promise<string> {
    try {
      const result = await this.callOdoo('ir.config_parameter', 'get_param', ['database.version']);
      return result || 'unknown';
    } catch (error) {
      return 'unknown';
    }
  }

  disconnect(): void {
    this.sessionId = null;
    this.uid = null;
  }
}

export default OdooApiService;
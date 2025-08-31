import CryptoJS from 'crypto-js';

export interface ConektaConfig {
  publicKey: string;
  privateKey: string;
  baseUrl: string;
  webhookSecret?: string;
}

export interface PaymentLinkData {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  amount: number; // In MXN pesos
  concept: string;
  reference?: string;
  expiresAt?: Date;
  metadata?: Record<string, any>;
}

export interface CustomerInfo {
  name: string;
  email: string;
  phone: string;
  corporate?: boolean;
  object?: string;
}

export interface LineItem {
  name: string;
  description?: string;
  unit_price: number; // In centavos
  quantity: number;
  sku?: string;
  category?: string;
  type?: string;
}

export interface ShippingAddress {
  street1: string;
  street2?: string;
  city: string;
  state: string;
  country: string;
  postal_code: string;
}

export interface PaymentMethod {
  type: 'oxxo_cash' | 'spei' | 'card';
  expires_at?: number;
}

export interface Charge {
  payment_method: PaymentMethod;
  amount?: number;
}

export interface OrderRequest {
  currency: string;
  customer_info: CustomerInfo;
  line_items: LineItem[];
  shipping_lines?: any[];
  discount_lines?: any[];
  charges: Charge[];
  checkout?: {
    allowed_payment_methods: string[];
    expires_at?: number;
  };
  metadata?: Record<string, any>;
  tax_lines?: any[];
}

export interface ConektaOrder {
  id: string;
  amount: number;
  amount_refunded: number;
  channel: string;
  checkout: {
    id: string;
    slug: string;
    url: string;
    expires_at: number;
    failure_url?: string;
    success_url?: string;
    allowed_payment_methods: string[];
  };
  charges: {
    data: ConektaCharge[];
    has_more: boolean;
    total: number;
  };
  created_at: number;
  currency: string;
  customer_info: CustomerInfo;
  line_items: {
    data: LineItem[];
    has_more: boolean;
    total: number;
  };
  livemode: boolean;
  metadata: Record<string, any>;
  object: string;
  payment_status: 'paid' | 'pending' | 'partially_paid' | 'pending_payment' | 'expired';
  processing_mode: string;
  shipping_contact?: any;
  updated_at: number;
}

export interface ConektaCharge {
  id: string;
  amount: number;
  channel: string;
  created_at: number;
  currency: string;
  device_fingerprint?: string;
  failure_code?: string;
  failure_message?: string;
  fee: number;
  livemode: boolean;
  monthly_installments?: number;
  object: string;
  order_id: string;
  paid_at?: number;
  payment_method: {
    type: string;
    object: string;
    auth_code?: string;
    bank?: string;
    clabe?: string;
    description?: string;
    expires_at?: number;
    issuer?: string;
    last4?: string;
    name?: string;
    reference?: string;
    service_name?: string;
    service_number?: string;
    store_name?: string;
  };
  reference_id?: string;
  refunds: any;
  status: 'pending_payment' | 'paid' | 'refunded' | 'partially_refunded' | 'chargeback';
  updated_at: number;
}

export interface PaymentLinkResponse {
  order: ConektaOrder;
  checkout: {
    id: string;
    url: string;
    expires_at: number;
  };
}

export interface WebhookPayload {
  id: string;
  object: string;
  type: string;
  created_at: number;
  data: {
    object: ConektaOrder | ConektaCharge;
  };
  webhook_status: string;
  webhook_logs: any[];
}

export interface OrderStatus {
  id: string;
  payment_status: 'paid' | 'pending' | 'partially_paid' | 'pending_payment' | 'expired';
  amount: number;
  amount_refunded: number;
  charges: ConektaCharge[];
  updated_at: number;
}

class ConektaService {
  private config: ConektaConfig;

  constructor(config: ConektaConfig) {
    this.config = config;
  }

  private getAuthHeaders(): Record<string, string> {
    const auth = btoa(`${this.config.privateKey}:`);
    return {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.conekta-v2.1.0+json'
    };
  }

  private pesosTocentavos(pesos: number): number {
    return Math.round(pesos * 100);
  }

  private centavosToPesos(centavos: number): number {
    return centavos / 100;
  }

  async createOrder(orderData: OrderRequest): Promise<ConektaOrder> {
    try {
      const response = await fetch(`${this.config.baseUrl}/orders`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(orderData)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Conekta API Error ${response.status}: ${errorData.message || response.statusText}`);
      }

      const order: ConektaOrder = await response.json();
      return order;
    } catch (error) {
      console.error('Failed to create Conekta order:', error);
      throw error;
    }
  }

  async createPaymentLink(data: PaymentLinkData): Promise<PaymentLinkResponse> {
    const amountCentavos = this.pesosTocentavos(data.amount);
    const expiresAt = data.expiresAt ? Math.floor(data.expiresAt.getTime() / 1000) : undefined;

    // Determine payment method based on amount
    const paymentMethod: PaymentMethod = data.amount > 20000 ? 
      { type: 'spei' } : 
      { type: 'oxxo_cash', expires_at: expiresAt };

    const orderData: OrderRequest = {
      currency: 'MXN',
      customer_info: {
        name: data.customerName,
        email: data.customerEmail,
        phone: data.customerPhone,
        object: 'customer_info'
      },
      line_items: [{
        name: data.concept,
        description: data.concept,
        unit_price: amountCentavos,
        quantity: 1,
        type: 'physical_good'
      }],
      charges: [{
        payment_method: paymentMethod,
        amount: amountCentavos
      }],
      checkout: {
        allowed_payment_methods: [paymentMethod.type],
        expires_at: expiresAt
      },
      metadata: {
        reference: data.reference,
        ...data.metadata
      }
    };

    const order = await this.createOrder(orderData);

    return {
      order,
      checkout: {
        id: order.checkout.id,
        url: order.checkout.url,
        expires_at: order.checkout.expires_at
      }
    };
  }

  async createOXXOPayment(data: PaymentLinkData): Promise<PaymentLinkResponse> {
    const paymentData = {
      ...data,
      expiresAt: data.expiresAt || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) // 3 days default
    };

    if (data.amount > 10000) {
      throw new Error('OXXO payments are limited to $10,000 MXN');
    }

    return this.createPaymentLink(paymentData);
  }

  async createSPEIPayment(data: PaymentLinkData): Promise<PaymentLinkResponse> {
    if (data.amount < 1000) {
      throw new Error('SPEI payments must be at least $1,000 MXN');
    }

    const orderData: OrderRequest = {
      currency: 'MXN',
      customer_info: {
        name: data.customerName,
        email: data.customerEmail,
        phone: data.customerPhone,
        object: 'customer_info'
      },
      line_items: [{
        name: data.concept,
        description: data.concept,
        unit_price: this.pesosTocentavos(data.amount),
        quantity: 1,
        type: 'physical_good'
      }],
      charges: [{
        payment_method: {
          type: 'spei'
        },
        amount: this.pesosTocentavos(data.amount)
      }],
      metadata: {
        reference: data.reference,
        ...data.metadata
      }
    };

    const order = await this.createOrder(orderData);

    return {
      order,
      checkout: {
        id: order.checkout?.id || '',
        url: order.checkout?.url || '',
        expires_at: order.checkout?.expires_at || 0
      }
    };
  }

  async getOrderStatus(orderId: string): Promise<OrderStatus> {
    try {
      const response = await fetch(`${this.config.baseUrl}/orders/${orderId}`, {
        headers: this.getAuthHeaders()
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Conekta API Error ${response.status}: ${errorData.message || response.statusText}`);
      }

      const order: ConektaOrder = await response.json();
      
      return {
        id: order.id,
        payment_status: order.payment_status,
        amount: this.centavosToPesos(order.amount),
        amount_refunded: this.centavosToPesos(order.amount_refunded),
        charges: order.charges.data,
        updated_at: order.updated_at
      };
    } catch (error) {
      console.error('Failed to get order status:', error);
      throw error;
    }
  }

  async getChargeDetails(chargeId: string): Promise<ConektaCharge> {
    try {
      const response = await fetch(`${this.config.baseUrl}/charges/${chargeId}`, {
        headers: this.getAuthHeaders()
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Conekta API Error ${response.status}: ${errorData.message || response.statusText}`);
      }

      return response.json();
    } catch (error) {
      console.error('Failed to get charge details:', error);
      throw error;
    }
  }

  async refundCharge(chargeId: string, amount?: number, reason?: string): Promise<any> {
    try {
      const refundData: any = {
        reason: reason || 'requested_by_client'
      };

      if (amount) {
        refundData.amount = this.pesosTocentavos(amount);
      }

      const response = await fetch(`${this.config.baseUrl}/charges/${chargeId}/refund`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(refundData)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Conekta API Error ${response.status}: ${errorData.message || response.statusText}`);
      }

      return response.json();
    } catch (error) {
      console.error('Failed to refund charge:', error);
      throw error;
    }
  }

  async handleWebhook(payload: WebhookPayload, signature: string): Promise<boolean> {
    if (!this.config.webhookSecret) {
      console.warn('Webhook secret not configured, skipping signature verification');
      return true;
    }

    try {
      // Verify webhook signature
      const expectedSignature = CryptoJS.HmacSHA256(
        JSON.stringify(payload), 
        this.config.webhookSecret
      ).toString();

      const providedSignature = signature.replace('sha256=', '');

      if (expectedSignature !== providedSignature) {
        console.error('Webhook signature verification failed');
        return false;
      }

      console.log(`Webhook verified for event: ${payload.type}`);
      return true;
    } catch (error) {
      console.error('Webhook signature verification error:', error);
      return false;
    }
  }

  async processWebhookEvent(payload: WebhookPayload): Promise<{
    type: string;
    orderId?: string;
    chargeId?: string;
    status: string;
    amount?: number;
    metadata?: Record<string, any>;
  }> {
    const { type, data } = payload;
    const eventData: any = {
      type,
      status: 'unknown'
    };

    switch (type) {
      case 'order.paid':
        const paidOrder = data.object as ConektaOrder;
        eventData.orderId = paidOrder.id;
        eventData.status = 'paid';
        eventData.amount = this.centavosToPesos(paidOrder.amount);
        eventData.metadata = paidOrder.metadata;
        break;

      case 'order.pending_payment':
        const pendingOrder = data.object as ConektaOrder;
        eventData.orderId = pendingOrder.id;
        eventData.status = 'pending';
        eventData.amount = this.centavosToPesos(pendingOrder.amount);
        eventData.metadata = pendingOrder.metadata;
        break;

      case 'order.expired':
        const expiredOrder = data.object as ConektaOrder;
        eventData.orderId = expiredOrder.id;
        eventData.status = 'expired';
        eventData.metadata = expiredOrder.metadata;
        break;

      case 'charge.paid':
        const paidCharge = data.object as ConektaCharge;
        eventData.chargeId = paidCharge.id;
        eventData.orderId = paidCharge.order_id;
        eventData.status = 'paid';
        eventData.amount = this.centavosToPesos(paidCharge.amount);
        break;

      case 'charge.pending_payment':
        const pendingCharge = data.object as ConektaCharge;
        eventData.chargeId = pendingCharge.id;
        eventData.orderId = pendingCharge.order_id;
        eventData.status = 'pending';
        eventData.amount = this.centavosToPesos(pendingCharge.amount);
        break;

      default:
        console.log(`Unhandled webhook event type: ${type}`);
    }

    return eventData;
  }

  // Utility methods
  isValidAmount(amount: number, paymentMethod: 'oxxo_cash' | 'spei'): boolean {
    if (paymentMethod === 'oxxo_cash') {
      return amount >= 10 && amount <= 10000;
    }
    if (paymentMethod === 'spei') {
      return amount >= 1000;
    }
    return false;
  }

  getRecommendedPaymentMethod(amount: number): 'oxxo_cash' | 'spei' {
    return amount > 20000 ? 'spei' : 'oxxo_cash';
  }

  generateReference(clientId: string, timestamp: number = Date.now()): string {
    return `CDM-${clientId}-${timestamp}`;
  }

  async testConnection(): Promise<boolean> {
    try {
      // Test with a simple webhook endpoint call (should return 404 but confirm connectivity)
      const response = await fetch(`${this.config.baseUrl}/webhooks`, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });
      
      // Any response (including 404) indicates successful connection
      return true;
    } catch (error) {
      console.error('Conekta connection test failed:', error);
      return false;
    }
  }
}

export default ConektaService;
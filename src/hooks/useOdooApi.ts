import { useState, useEffect, useCallback } from 'react';
import OdooApiService from '../services/api/odooApiService';
import type { Client, Opportunity, Document } from '../types/types';

interface UseOdooApiState {
  loading: boolean;
  error: string | null;
  authenticated: boolean;
  sessionInfo: { sessionId: string; uid: number } | null;
}

export const useOdooApi = (service: OdooApiService | null) => {
  const [state, setState] = useState<UseOdooApiState>({
    loading: false,
    error: null,
    authenticated: false,
    sessionInfo: null
  });

  // Authentication
  const authenticate = useCallback(async () => {
    if (!service) return false;

    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const sessionInfo = await service.authenticate();
      setState(prev => ({
        ...prev,
        loading: false,
        authenticated: true,
        sessionInfo
      }));
      return true;
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Authentication failed',
        authenticated: false
      }));
      return false;
    }
  }, [service]);

  // Clients
  const getClients = useCallback(async (market?: string): Promise<Client[]> => {
    if (!service) throw new Error('Odoo service not available');
    
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const clients = await service.getClients(market);
      setState(prev => ({ ...prev, loading: false }));
      return clients;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch clients';
      setState(prev => ({ ...prev, loading: false, error: errorMessage }));
      throw error;
    }
  }, [service]);

  const getClient = useCallback(async (clientId: number): Promise<Client> => {
    if (!service) throw new Error('Odoo service not available');
    return service.getClient(clientId);
  }, [service]);

  const createClient = useCallback(async (clientData: Partial<Client>): Promise<number> => {
    if (!service) throw new Error('Odoo service not available');
    
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const clientId = await service.createClient(clientData);
      setState(prev => ({ ...prev, loading: false }));
      return clientId;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create client';
      setState(prev => ({ ...prev, loading: false, error: errorMessage }));
      throw error;
    }
  }, [service]);

  const updateClient = useCallback(async (clientId: number, updates: Partial<Client>): Promise<boolean> => {
    if (!service) throw new Error('Odoo service not available');
    return service.updateClient(clientId, updates);
  }, [service]);

  // Opportunities
  const createOpportunity = useCallback(async (opportunityData: Partial<Opportunity>): Promise<number> => {
    if (!service) throw new Error('Odoo service not available');
    
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const opportunityId = await service.createOpportunity(opportunityData);
      setState(prev => ({ ...prev, loading: false }));
      return opportunityId;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create opportunity';
      setState(prev => ({ ...prev, loading: false, error: errorMessage }));
      throw error;
    }
  }, [service]);

  const updateOpportunityStage = useCallback(async (
    opportunityId: number, 
    stageId: number
  ): Promise<boolean> => {
    if (!service) throw new Error('Odoo service not available');
    return service.updateOpportunityStage(opportunityId, stageId);
  }, [service]);

  // Documents
  const uploadDocument = useCallback(async (documentData: {
    name: string;
    clientId: number;
    type: string;
    content: string;
    mimeType?: string;
  }): Promise<number> => {
    if (!service) throw new Error('Odoo service not available');
    
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const documentId = await service.uploadDocument(documentData);
      setState(prev => ({ ...prev, loading: false }));
      return documentId;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload document';
      setState(prev => ({ ...prev, loading: false, error: errorMessage }));
      throw error;
    }
  }, [service]);

  const getDocuments = useCallback(async (since?: Date): Promise<Document[]> => {
    if (!service) throw new Error('Odoo service not available');
    return service.getDocuments(since);
  }, [service]);

  // Events
  const createEvent = useCallback(async (eventData: {
    clientId: number;
    type: string;
    description: string;
    metadata?: any;
  }): Promise<number> => {
    if (!service) throw new Error('Odoo service not available');
    return service.createEvent(eventData);
  }, [service]);

  // Financial
  const recordPayment = useCallback(async (paymentData: {
    clientId: number;
    amount: number;
    method: string;
    reference?: string;
    metadata?: any;
  }): Promise<number> => {
    if (!service) throw new Error('Odoo service not available');
    return service.recordPayment(paymentData);
  }, [service]);

  const getAccountBalance = useCallback(async (clientId: number): Promise<{
    balance: number;
    currency: string;
    lastUpdated: string;
  }> => {
    if (!service) throw new Error('Odoo service not available');
    return service.getAccountBalance(clientId);
  }, [service]);

  // Quotations
  const createQuotation = useCallback(async (quotationData: {
    clientId: number;
    packageConfig: any;
    amortizationTable: any[];
    metadata?: any;
  }): Promise<number> => {
    if (!service) throw new Error('Odoo service not available');
    return service.createQuotation(quotationData);
  }, [service]);

  // Business Intelligence
  const getDashboardMetrics = useCallback(async (market?: string, dateRange?: {
    start: string;
    end: string;
  }): Promise<{
    totalClients: number;
    activeOpportunities: number;
    monthlyRevenue: number;
    conversionRate: number;
    topPerformers: Array<{ name: string; value: number }>;
  }> => {
    if (!service) throw new Error('Odoo service not available');
    return service.getDashboardMetrics(market, dateRange);
  }, [service]);

  const getSalesReport = useCallback(async (period: 'month' | 'quarter' | 'year'): Promise<{
    totalSales: number;
    salesByMarket: Array<{ market: string; amount: number; count: number }>;
    salesByProduct: Array<{ product: string; amount: number; count: number }>;
    trend: Array<{ period: string; amount: number }>;
  }> => {
    if (!service) throw new Error('Odoo service not available');
    return service.getSalesReport(period);
  }, [service]);

  // Check connection status on service change
  useEffect(() => {
    if (service) {
      service.testConnection().then(connected => {
        if (connected) {
          setState(prev => ({ ...prev, authenticated: true }));
        } else {
          authenticate();
        }
      });
    }
  }, [service, authenticate]);

  return {
    // State
    loading: state.loading,
    error: state.error,
    authenticated: state.authenticated,
    sessionInfo: state.sessionInfo,
    
    // Authentication
    authenticate,
    
    // Clients
    getClients,
    getClient,
    createClient,
    updateClient,
    
    // Opportunities
    createOpportunity,
    updateOpportunityStage,
    
    // Documents
    uploadDocument,
    getDocuments,
    
    // Events
    createEvent,
    
    // Financial
    recordPayment,
    getAccountBalance,
    
    // Quotations
    createQuotation,
    
    // Business Intelligence
    getDashboardMetrics,
    getSalesReport,
    
    // Direct service access
    service
  };
};

export default useOdooApi;
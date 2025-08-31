


import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './src/components/shared/Header';
import { Sidebar, View } from './src/components/shared/Sidebar';
import { ToastContainer, toast } from './src/components/shared/Toast';
import { Settings } from './src/components/shared/Settings';
import { Client, Notification, Quote, NavigationContext } from './src/models/types';
import { simulationService } from './src/services/simulation/simulationService';
import { Cotizador } from './src/components/shared/Cotizador';
import { Ecosystems } from './src/components/shared/Ecosystems';
import { Dashboard } from './src/components/shared/Dashboard';
import { Opportunities } from './src/components/shared/Opportunities';
import { ClientsView } from './src/components/shared/ClientsView';
import { ClientDetail } from './src/components/shared/ClientDetail';
import { CollectiveCredit } from './src/components/shared/CollectiveCredit';
import { BottomNavBar } from './src/components/shared/BottomNavBar';
import { SimulatorLanding } from './src/components/shared/SimulatorLanding';

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<View>('dashboard');
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [simulatingClient, setSimulatingClient] = useState<Client | null>(null);
  const [simulationMode, setSimulationMode] = useState<'acquisition' | 'savings'>('acquisition');
  const [sidebarAlerts, setSidebarAlerts] = useState<{ [key in View]?: number }>({});
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isOpportunityModalOpen, setIsOpportunityModalOpen] = useState(false);
  const [navigationContext, setNavigationContext] = useState<NavigationContext | null>(null);

  const calculateSidebarAlerts = useCallback(async (currentClients: Client[]) => {
    if (currentClients.length > 0) {
        const counts = await simulationService.getSidebarAlertCounts(currentClients);
        setSidebarAlerts(counts);
    }
  }, []);

  const fetchClients = useCallback(async (clientIdToSelect?: string) => {
    setIsLoading(true);
    try {
      const rawData = await simulationService.getClients();
      const data = rawData.map(client => ({
        ...client,
        events: client.events.map(event => ({
          ...event,
          timestamp: new Date(event.timestamp as any),
        })),
      }));
      setClients(data);
      calculateSidebarAlerts(data);

      if (clientIdToSelect) {
          const clientToSelect = data.find(c => c.id === clientIdToSelect);
          setSelectedClient(clientToSelect || null);
      }
    } catch (error) {
      console.error("Failed to fetch clients:", error);
    } finally {
      setIsLoading(false);
    }
  }, [calculateSidebarAlerts]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);
  
  useEffect(() => {
    const intervalId = setInterval(async () => {
        try {
            const newAlert = await simulationService.getSimulatedAlert(clients);
            if (newAlert) {
                const newNotificationWithDate = { ...newAlert, timestamp: new Date(newAlert.timestamp) };
                setNotifications(prev => [newNotificationWithDate, ...prev]);
                setUnreadCount(prev => prev + 1);
            }
        } catch (error) {
            console.error("Failed to fetch simulated alert:", error);
        }
    }, 8000);
    return () => clearInterval(intervalId);
  }, [clients]);

  const handleClientUpdate = useCallback((updatedClient: Client) => {
    const sanitizedClient = {
        ...updatedClient,
        events: updatedClient.events.map(e => ({...e, timestamp: new Date(e.timestamp as any)}))
    };
    const updatedClients = clients.map(c => c.id === sanitizedClient.id ? sanitizedClient : c);
    setClients(updatedClients);
    setSelectedClient(sanitizedClient);
    calculateSidebarAlerts(updatedClients);
  }, [clients, calculateSidebarAlerts]);
  
  const handleClientCreated = useCallback((newClient: Client, mode: 'acquisition' | 'savings') => {
    const newClients = [...clients, newClient];
    setClients(newClients);
    setSimulatingClient(newClient);
    setSimulationMode(mode);
    setActiveView('simulador');
    setSelectedClient(null);
    calculateSidebarAlerts(newClients);
  }, [clients, calculateSidebarAlerts]);

  const handleFormalize = useCallback(async (quote: Quote) => {
    if (!simulatingClient) return;
    toast.info(`Formalizando plan para ${simulatingClient.name}...`);
    try {
        const updatedClient = await simulationService.saveQuoteToClient(simulatingClient.id, quote);
        setSimulatingClient(null);
        await fetchClients(updatedClient.id);
        toast.success("Plan formalizado. Procediendo al expediente.");
    } catch (e) {
        toast.error("Error al formalizar el plan.");
    }
  }, [simulatingClient, fetchClients]);

  const handleGenericFormalize = useCallback(() => {
    toast.info('Para formalizar un plan, por favor, inicia desde el botón "+ Nueva Oportunidad".');
  }, []);

  const handleNotificationAction = useCallback((notification: Notification) => {
    if (notification.clientId) {
      const client = clients.find(c => c.id === notification.clientId);
      if (client) {
        setSelectedClient(client);
        setSimulatingClient(null);
        setActiveView('dashboard');
      }
    }
  }, [clients]);

  const handleMarkAsRead = useCallback(() => setUnreadCount(0), []);

  const handleSelectClient = useCallback((client: Client | null, context?: NavigationContext) => {
      setSelectedClient(client);
      setNavigationContext(context || null);
  }, []);

  const handleViewChange = (view: View) => {
    setSelectedClient(null);
    setSimulatingClient(null);
    setNavigationContext(null);
    setActiveView(view);
  };
  
  const handleBackFromDetail = () => {
    setSelectedClient(null);
    setNavigationContext(null);
  };

  const renderContent = () => {
    if (simulatingClient) {
        return <Cotizador client={simulatingClient} onFormalize={handleFormalize} initialMode={simulationMode} />;
    }
    if (selectedClient) {
        return <ClientDetail client={selectedClient} onClientUpdate={handleClientUpdate} onBack={handleBackFromDetail} navigationContext={navigationContext} />;
    }

    switch(activeView) {
      case 'dashboard':
        return <Dashboard onClientSelect={handleSelectClient} />;
      case 'simulador':
        return <SimulatorLanding onNewOpportunity={() => setIsOpportunityModalOpen(true)} />;
      case 'oportunidades':
        return <Opportunities onClientSelect={handleSelectClient} />;
      case 'ecosistemas':
        return <Ecosystems clients={clients} onClientSelect={handleSelectClient} />;
      case 'clientes':
        return <ClientsView clients={clients} onClientSelect={handleSelectClient} />;
      case 'grupos-colectivos':
        return <CollectiveCredit />;
      case 'configuracion':
        return <Settings />;
      default:
        return <Dashboard onClientSelect={handleSelectClient} />;
    }
  }

  return (
    <>
      <ToastContainer />
      <div className="flex h-screen bg-gray-950 text-gray-200 font-sans">
        <Sidebar 
          activeView={activeView} 
          onViewChange={handleViewChange} 
          alertCounts={sidebarAlerts} 
          isCollapsed={isSidebarCollapsed}
          setIsCollapsed={setIsSidebarCollapsed}
        />
        <div className="flex flex-col flex-1">
          <Header 
            onClientCreated={handleClientCreated}
            notifications={notifications}
            unreadCount={unreadCount}
            onNotificationAction={handleNotificationAction}
            onMarkAsRead={handleMarkAsRead}
            isOpportunityModalOpen={isOpportunityModalOpen}
            setIsOpportunityModalOpen={setIsOpportunityModalOpen}
          />
          <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto pb-20 md:pb-8">
            {renderContent()}
          </main>
        </div>
      </div>
      <BottomNavBar 
        activeView={activeView} 
        onViewChange={handleViewChange} 
        alertCounts={sidebarAlerts} 
      />
    </>
  );
};

export default App;
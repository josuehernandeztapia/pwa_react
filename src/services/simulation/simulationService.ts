import { Client, BusinessFlow, DocumentStatus, EventLog, Actor, PaymentLinkDetails, Document, CollectiveCreditGroup, CollectiveCreditMember, EventType, OpportunityStage, ImportStatus, Notification, NotificationType, ActionableGroup, ActionableClient, Ecosystem, Quote, Market, ProtectionScenario, TandaGroupInput, TandaSimConfig, TandaSimulationResult, TandaMonthState, TandaAward, TandaRiskBadge } from '../../models/types';
import { View } from '../components/Sidebar';

// Use mutable maps to simulate a database
const clientsDB = new Map<string, Client>();
const collectiveCreditGroupsDB = new Map<string, CollectiveCreditGroup>();
const ecosystemsDB = new Map<string, Ecosystem>();


// --- Document Checklists ---
const CONTADO_DOCS: Document[] = [
    { id: '1', name: 'INE Vigente', status: DocumentStatus.Pendiente },
    { id: '2', name: 'Comprobante de domicilio', status: DocumentStatus.Pendiente },
    { id: '3', name: 'Constancia de situación fiscal', status: DocumentStatus.Pendiente },
];
const AGUASCALIENTES_FINANCIERO_DOCS: Document[] = [
    { id: '1', name: 'INE Vigente', status: DocumentStatus.Pendiente },
    { id: '2', name: 'Comprobante de domicilio', status: DocumentStatus.Pendiente },
    { id: '3', name: 'Tarjeta de circulación', status: DocumentStatus.Pendiente },
    { id: '4', name: 'Copia de la concesión', status: DocumentStatus.Pendiente },
    { id: '5', name: 'Constancia de situación fiscal', status: DocumentStatus.Pendiente },
    { id: '6', name: 'Verificación Biométrica (Metamap)', status: DocumentStatus.Pendiente },
];
const EDOMEX_MIEMBRO_DOCS: Document[] = [
    ...AGUASCALIENTES_FINANCIERO_DOCS,
    { id: '7', name: 'Carta Aval de Ruta', status: DocumentStatus.Pendiente, tooltip: "Documento emitido y validado por el Ecosistema/Ruta." },
    { id: '8', name: 'Convenio de Dación en Pago', status: DocumentStatus.Pendiente, tooltip: "Convenio que formaliza el colateral social." },
];
const EDOMEX_AHORRO_DOCS: Document[] = [
    { id: '1', name: 'INE Vigente', status: DocumentStatus.Pendiente },
    { id: '2', name: 'Comprobante de domicilio', status: DocumentStatus.Pendiente },
];


// Helper to add derived properties for UI components
const addDerivedGroupProperties = (group: CollectiveCreditGroup): CollectiveCreditGroup => {
    const isSavingPhase = group.unitsDelivered < group.totalUnits;
    const isPayingPhase = group.unitsDelivered > 0;

    let phase: 'saving' | 'payment' | 'dual' | 'completed' = 'saving';
    if (isSavingPhase && isPayingPhase) {
        phase = 'dual';
    } else if (isPayingPhase && !isSavingPhase) {
        phase = 'payment';
    } else if (group.unitsDelivered === group.totalUnits) {
        phase = 'payment';
    }


    return {
        ...group,
        phase,
        savingsGoal: group.savingsGoalPerUnit,
        currentSavings: group.currentSavingsProgress,
        monthlyPaymentGoal: group.monthlyPaymentPerUnit * group.unitsDelivered,
    };
};

// --- INITIAL DATA ---
const initialEcosystems: Ecosystem[] = [
    { id: 'eco-1', name: 'Ruta 27 de Toluca S.A. de C.V.', status: 'Activo', documents: [{id: 'eco-1-doc-1', name: 'Acta Constitutiva de la Ruta', status: DocumentStatus.Aprobado}, {id: 'eco-1-doc-2', name: 'Poder del Representante Legal', status: DocumentStatus.Aprobado}]},
    { id: 'eco-2', name: 'Autotransportes de Tlalnepantla', status: 'Expediente Pendiente', documents: [{id: 'eco-2-doc-1', name: 'Acta Constitutiva de la Ruta', status: DocumentStatus.Pendiente}]},
];

const collectiveCreditClients: Client[] = Array.from({ length: 12 }, (_, i) => ({
  id: `cc-${i + 1}`,
  name: `Miembro Crédito Colectivo ${i + 1}`,
  avatarUrl: `https://picsum.photos/seed/cc-member-${i+1}/100/100`,
  flow: BusinessFlow.CreditoColectivo,
  status: 'Activo en Grupo',
  healthScore: 80,
  documents: EDOMEX_AHORRO_DOCS.map(d => ({ ...d, status: DocumentStatus.Aprobado })),
  events: [
      { id: `evt-cc-${i+1}`, timestamp: new Date(Date.now() - (i*5*24*60*60*1000)), message: `Aportación individual realizada.`, actor: Actor.Cliente, type: EventType.Contribution, details: {amount: 15000 * Math.random(), currency: 'MXN'} }
  ],
  collectiveCreditGroupId: i < 5 ? 'cc-2405' : (i < 9 ? 'cc-2406' : 'cc-2408'),
  ecosystemId: 'eco-1'
}));

const initialClients: Client[] = [
  {
    id: '1',
    name: 'Juan Pérez (Venta a Plazo AGS)',
    avatarUrl: 'https://picsum.photos/seed/juan/100/100',
    flow: BusinessFlow.VentaPlazo,
    status: 'Activo',
    healthScore: 85,
    remainderAmount: 341200, // For Venta a Plazo
    paymentPlan: {
        monthlyGoal: 18282.88,
        currentMonthProgress: 6000,
        currency: 'MXN',
        methods: {
            collection: true,
            voluntary: true
        },
        collectionDetails: {
            plates: ['XYZ-123-A'],
            pricePerLiter: 5
        }
    },
    protectionPlan: {
        type: 'Esencial',
        restructuresAvailable: 1,
        restructuresUsed: 0,
        annualResets: 1,
    },
    documents: AGUASCALIENTES_FINANCIERO_DOCS.map((doc, i) => ({
      ...doc,
      status: i < 2 ? DocumentStatus.Aprobado : DocumentStatus.Pendiente
    })),
    events: [
      { id: 'evt1-3', timestamp: new Date(), message: 'Aportación Voluntaria confirmada.', actor: Actor.Sistema, type: EventType.Contribution, details: { amount: 5000, currency: 'MXN' } },
      { id: 'evt1-4', timestamp: new Date(Date.now() - 0.5 * 24 * 60 * 60 * 1000), message: 'Recaudación Flota (Placa XYZ-123-A).', actor: Actor.Sistema, type: EventType.Collection, details: { amount: 1000, currency: 'MXN', plate: 'XYZ-123-A' } },
      { id: 'evt1-2', timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), message: 'Documento INE/IFE cargado.', actor: Actor.Cliente, type: EventType.ClientAction },
      { id: 'evt1-1', timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), message: 'Plan de Venta a Plazo creado.', actor: Actor.Asesor, type: EventType.AdvisorAction },
    ],
  },
  {
    id: '2',
    name: 'Maria García (EdoMex)',
    avatarUrl: 'https://picsum.photos/seed/maria/100/100',
    flow: BusinessFlow.VentaPlazo,
    status: 'Pagos al Corriente',
    healthScore: 92,
    ecosystemId: 'eco-1',
    remainderAmount: 818500,
    paymentPlan: {
        monthlyGoal: 22836.83,
        currentMonthProgress: 9500,
        currency: 'MXN',
        methods: {
            collection: true,
            voluntary: true,
        },
        collectionDetails: {
            plates: ['MGA-789-C'],
            pricePerLiter: 7,
        }
    },
    protectionPlan: {
        type: 'Total',
        restructuresAvailable: 3,
        restructuresUsed: 1,
        annualResets: 3,
    },
    documents: EDOMEX_MIEMBRO_DOCS.map(doc => ({ ...doc, status: DocumentStatus.Aprobado })),
    events: [
      { id: 'evt2-3', timestamp: new Date(), message: 'Aportación a mensualidad confirmada.', actor: Actor.Sistema, type: EventType.Contribution, details: { amount: 5000, currency: 'MXN' } },
      { id: 'evt2-2', timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), message: 'Recaudación Flota (Placa MGA-789-C).', actor: Actor.Sistema, type: EventType.Collection, details: { amount: 4500, currency: 'MXN', plate: 'MGA-789-C' } },
      { id: 'evt2-1', timestamp: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), message: 'Plan de Pagos Híbrido configurado.', actor: Actor.Asesor, type: EventType.AdvisorAction },
    ],
  },
  { id: '3', name: 'Carlos Rodriguez', avatarUrl: 'https://picsum.photos/seed/carlos/100/100', flow: BusinessFlow.CreditoColectivo, status: 'Esperando Sorteo', healthScore: 78, documents: EDOMEX_AHORRO_DOCS.map(d => ({ ...d, status: DocumentStatus.Aprobado })), events: [{ id: 'evt3-1', timestamp: new Date(), message: 'Se unió al grupo de Crédito Colectivo "CC-2405 MAYO".', actor: Actor.Asesor, type: EventType.AdvisorAction },], collectiveCreditGroupId: 'cc-2405', ecosystemId: 'eco-1' },
  { id: '4', name: 'Ana López', avatarUrl: 'https://picsum.photos/seed/ana/100/100', flow: BusinessFlow.AhorroProgramado, status: 'Meta Alcanzada', healthScore: 98, savingsPlan: { progress: 153075, goal: 153075, currency: 'MXN', totalValue: 1020500, methods: { voluntary: true, collection: false } }, documents: EDOMEX_AHORRO_DOCS.map(d => ({ ...d, status: DocumentStatus.Aprobado })), events: [ { id: 'evt4-1', timestamp: new Date(), message: '¡Meta de ahorro completada! Listo para iniciar Venta a Plazo.', actor: Actor.Sistema, type: EventType.GoalAchieved }, ], ecosystemId: 'eco-2' },
  { id: 'laura-1', name: 'Laura Jimenez', avatarUrl: 'https://picsum.photos/seed/laura/100/100', flow: BusinessFlow.VentaPlazo, status: 'Aprobado', healthScore: 95, documents: EDOMEX_MIEMBRO_DOCS.map(d => ({ ...d, status: DocumentStatus.Aprobado })), events: [{ id: 'evt-laura-1', timestamp: new Date(), message: 'Crédito aprobado. Pendiente de configurar plan de pagos.', actor: Actor.Sistema, type: EventType.System }], ecosystemId: 'eco-1' },
  { id: 'sofia-1', name: 'Sofia Vargas', avatarUrl: 'https://picsum.photos/seed/sofia/100/100', flow: BusinessFlow.CreditoColectivo, status: 'Turno Adjudicado', healthScore: 96, documents: EDOMEX_AHORRO_DOCS.map(d => ({ ...d, status: DocumentStatus.Aprobado })), events: [{ id: 'evt-sofia-1', timestamp: new Date(), message: 'Turno de crédito adjudicado. ¡Felicidades!', actor: Actor.Sistema, type: EventType.GoalAchieved }], collectiveCreditGroupId: 'cc-2405', ecosystemId: 'eco-1' },
  { 
    id: 'roberto-1', 
    name: 'Roberto Mendoza (Contado AGS)', 
    avatarUrl: 'https://picsum.photos/seed/roberto/100/100', 
    flow: BusinessFlow.VentaDirecta, 
    status: 'Unidad Lista para Entrega', 
    healthScore: 88, 
    documents: CONTADO_DOCS.map(doc => ({...doc, status: DocumentStatus.Aprobado})),
    events: [ 
      {id: 'evt-roberto-1', timestamp: new Date(), message: 'Contrato Promesa de Compraventa firmado para Venta Directa.', actor: Actor.Sistema, type: EventType.System }, 
      {id: 'evt-roberto-2', timestamp: new Date(), message: 'Pago de enganche recibido.', actor: Actor.Cliente, type: EventType.Contribution, details: {amount: 400000, currency: 'MXN'}}, 
    ], 
    downPayment: 400000, 
    remainderAmount: 453000, // 853000 (AGS Package) - 400000
    importStatus: { pedidoPlanta: 'completed', unidadFabricada: 'completed', transitoMaritimo: 'completed', enAduana: 'completed', liberada: 'completed' } 
  },
  ...collectiveCreditClients,
];

const createMembers = (clients: Client[]): CollectiveCreditMember[] => { return clients.map(c => ({ clientId: c.id, name: c.name, avatarUrl: c.avatarUrl, status: 'active', individualContribution: c.events.filter(e => e.type === EventType.Contribution && e.details?.amount).reduce((sum, e) => sum + (e.details?.amount || 0), 0) })); };
const group1Members = createMembers([ ...initialClients.filter(c => c.collectiveCreditGroupId === 'cc-2405'), ...collectiveCreditClients.filter(c => c.collectiveCreditGroupId === 'cc-2405') ]);
const group2Members = createMembers(collectiveCreditClients.filter(c => c.collectiveCreditGroupId === 'cc-2406'));
const group3Members = createMembers(collectiveCreditClients.filter(c => c.collectiveCreditGroupId === 'cc-2408'));
const initialCollectiveCreditGroups: CollectiveCreditGroup[] = [
  { id: 'cc-2405', name: 'CC-2405 MAYO', capacity: 10, members: group1Members, totalUnits: 5, unitsDelivered: 0, savingsGoalPerUnit: 153075, currentSavingsProgress: group1Members.reduce((sum, m) => sum + m.individualContribution, 0), monthlyPaymentPerUnit: 25720.52, currentMonthPaymentProgress: 0, },
  { id: 'cc-2406', name: 'CC-2406 JUNIO', capacity: 10, members: group2Members, totalUnits: 5, unitsDelivered: 0, savingsGoalPerUnit: 153075, currentSavingsProgress: group2Members.reduce((sum, m) => sum + m.individualContribution, 0), monthlyPaymentPerUnit: 25720.52, currentMonthPaymentProgress: 0, },
  { id: 'cc-2407', name: 'CC-2407 JULIO', capacity: 10, members: [], totalUnits: 5, unitsDelivered: 5, savingsGoalPerUnit: 153075, currentSavingsProgress: 0, monthlyPaymentPerUnit: 25720.52, currentMonthPaymentProgress: 100000, },
  { id: 'cc-2408', name: 'CC-2408 AGOSTO', capacity: 10, members: group3Members, totalUnits: 5, unitsDelivered: 1, savingsGoalPerUnit: 153075, currentSavingsProgress: 45000, monthlyPaymentPerUnit: 25720.52, currentMonthPaymentProgress: 18000, },
];

const initializeDB = () => {
    clientsDB.clear();
    collectiveCreditGroupsDB.clear();
    ecosystemsDB.clear();
    initialClients.forEach(c => clientsDB.set(c.id, c));
    initialCollectiveCreditGroups.forEach(t => collectiveCreditGroupsDB.set(t.id, t));
    initialEcosystems.forEach(e => ecosystemsDB.set(e.id, e));
};
initializeDB(); // Initialize on load

const mockApi = <T,>(data: T, delay = 500): Promise<T> =>
  new Promise(resolve => setTimeout(() => resolve(JSON.parse(JSON.stringify(data))), delay));

let notificationId = 0;

const getFilteredClients = (market: Market) => {
    let clients = Array.from(clientsDB.values());
    if (market === 'aguascalientes') {
        return clients.filter(c => !c.ecosystemId);
    } else if (market === 'edomex') {
        return clients.filter(c => !!c.ecosystemId);
    }
    return clients;
};

// --- Financial Helpers for Protection Simulation ---
const annuity = (principal: number, monthlyRate: number, term: number): number => {
    if (term <= 0) return principal;
    if (monthlyRate <= 0) return principal / term;
    return (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -term));
};

const getBalance = (originalPrincipal: number, originalPayment: number, monthlyRate: number, monthsPaid: number): number => {
    if (monthlyRate <= 0) return originalPrincipal - (originalPayment * monthsPaid);
    return originalPrincipal * Math.pow(1 + monthlyRate, monthsPaid) - originalPayment * (Math.pow(1 + monthlyRate, monthsPaid) - 1) / monthlyRate;
};


// --- HIERARCHICAL GETTERS ---
const getEcosystemById = (id: string): Promise<Ecosystem | undefined> => mockApi(ecosystemsDB.get(id));
const getGroupsByEcosystemId = (ecosystemId: string): Promise<CollectiveCreditGroup[]> => {
    const allGroups = Array.from(collectiveCreditGroupsDB.values());
    const ecosystemClients = Array.from(clientsDB.values()).filter(c => c.ecosystemId === ecosystemId);
    const ecosystemGroupIds = new Set(ecosystemClients.map(c => c.collectiveCreditGroupId));
    return mockApi(allGroups.filter(g => ecosystemGroupIds.has(g.id)));
};
const getClientsByEcosystemId = (ecosystemId: string): Promise<Client[]> => {
    return mockApi(Array.from(clientsDB.values()).filter(c => c.ecosystemId === ecosystemId));
};


export const simulationService = {
  // --- CORE SERVICES ---
  getClients: (): Promise<Client[]> => mockApi(Array.from(clientsDB.values()), 1000),

  getCollectiveCreditGroups: (): Promise<CollectiveCreditGroup[]> => {
    const groups = Array.from(collectiveCreditGroupsDB.values());
    const processedGroups = groups.map(g => {
        const group = {...g};
        const memberClients = group.members.map(m => clientsDB.get(m.clientId)).filter(Boolean) as Client[];
        const updatedMembers = createMembers(memberClients);
        group.members = updatedMembers;
        if(group.unitsDelivered === 0) {
            group.currentSavingsProgress = updatedMembers.reduce((sum, m) => sum + m.individualContribution, 0);
        }
        return addDerivedGroupProperties(group);
    });
    return mockApi(processedGroups, 800);
  },
  
  getCollectiveCreditGroupById: (id: string): Promise<CollectiveCreditGroup | undefined> => {
      const groupFromDB = collectiveCreditGroupsDB.get(id);
      if(!groupFromDB) return mockApi(undefined);
      const group = { ...groupFromDB };
      const memberClients = group.members.map(m => clientsDB.get(m.clientId)).filter(Boolean) as Client[];
      const updatedMembers = createMembers(memberClients);
      group.members = updatedMembers;
      if(group.unitsDelivered === 0) {
        group.currentSavingsProgress = updatedMembers.reduce((sum, m) => sum + m.individualContribution, 0);
      }
      return mockApi(addDerivedGroupProperties(group));
  },
  
  addNewEvent: (clientId: string, message: string, actor: Actor, type: EventType, details?: any): Promise<EventLog> => {
      const client = clientsDB.get(clientId);
      if (!client) return Promise.reject("Client not found");
      const newEvent: EventLog = {
          id: `evt-${clientId}-${Date.now()}`,
          timestamp: new Date(),
          message,
          actor,
          type,
          details
      };
      client.events = [newEvent, ...client.events].sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      clientsDB.set(clientId, client);
      return mockApi(newEvent);
  },

  // --- ONBOARDING ENGINE ---
  createClientFromOnboarding: (config: { name: string, market: 'aguascalientes' | 'edomex', saleType: 'contado' | 'financiero', ecosystemId?: string }): Promise<Client> => {
    const newId = `onboard-${Date.now()}`;
    let documents: Document[] = [];
    let flow: BusinessFlow;

    if (config.saleType === 'contado') {
        flow = BusinessFlow.VentaDirecta;
        documents = CONTADO_DOCS.map(d => ({ ...d, id: `${newId}-${d.id}`}));
    } else { // Financiero
        flow = BusinessFlow.VentaPlazo;
        if (config.market === 'aguascalientes') {
            documents = AGUASCALIENTES_FINANCIERO_DOCS.map(d => ({ ...d, id: `${newId}-${d.id}`}));
        } else { // EdoMex
            documents = EDOMEX_MIEMBRO_DOCS.map(d => ({ ...d, id: `${newId}-${d.id}`}));
        }
    }
    
    const newClient: Client = {
      id: newId,
      name: config.name,
      avatarUrl: `https://picsum.photos/seed/${newId}/100/100`,
      flow,
      status: 'Nuevas Oportunidades',
      healthScore: 70,
      documents,
      events: [{ id: `${newId}-evt-1`, timestamp: new Date(), message: `Oportunidad creada desde el flujo de ${config.market}.`, actor: Actor.Asesor, type: EventType.AdvisorAction }],
      ecosystemId: config.ecosystemId,
    };
    clientsDB.set(newId, newClient);
    return mockApi(newClient);
  },

  createSavingsOpportunity: (config: { name: string; market: 'aguascalientes' | 'edomex'; ecosystemId?: string; clientType: 'individual' | 'colectivo' }): Promise<Client> => {
    const newId = `saving-${Date.now()}`;
    
    const documents = EDOMEX_AHORRO_DOCS.map(d => ({ ...d, id: `${newId}-${d.id}`}));
    const flow = config.clientType === 'colectivo' ? BusinessFlow.CreditoColectivo : BusinessFlow.AhorroProgramado;

    const newClient: Client = {
      id: newId,
      name: config.name,
      avatarUrl: `https://picsum.photos/seed/${newId}/100/100`,
      flow,
      status: 'Nuevas Oportunidades',
      healthScore: 70,
      documents,
      events: [{ id: `${newId}-evt-1`, timestamp: new Date(), message: `Oportunidad de ${flow} creada en ${config.market}.`, actor: Actor.Asesor, type: EventType.AdvisorAction }],
      ecosystemId: config.ecosystemId,
    };
    clientsDB.set(newId, newClient);
    return mockApi(newClient);
  },
  
  // --- ECOSYSTEM SERVICES ---
  getEcosystems: (): Promise<Ecosystem[]> => mockApi(Array.from(ecosystemsDB.values()), 700),
  getEcosystemById,
  getGroupsByEcosystemId,
  getClientsByEcosystemId,
  
  createEcosystem: (name: string): Promise<Ecosystem> => {
    const newId = `eco-${Date.now()}`;
    const newEcosystem: Ecosystem = {
        id: newId,
        name: name,
        status: 'Expediente Pendiente',
        documents: [
            { id: `${newId}-doc-1`, name: 'Acta Constitutiva de la Ruta', status: DocumentStatus.Pendiente },
            { id: `${newId}-doc-2`, name: 'Poder del Representante Legal', status: DocumentStatus.Pendiente },
        ]
    };
    ecosystemsDB.set(newId, newEcosystem);
    return mockApi(newEcosystem);
  },

  saveQuoteToClient: (clientId: string, quote: Quote): Promise<Client> => {
    const client = clientsDB.get(clientId);
    if (!client) return Promise.reject("Client not found");

    client.flow = quote.flow;
    client.status = "Expediente en Proceso";

    if (quote.flow === BusinessFlow.AhorroProgramado) {
        client.savingsPlan = {
            progress: 0,
            goal: quote.downPayment,
            currency: 'MXN',
            totalValue: quote.totalPrice,
            methods: { collection: false, voluntary: true }
        };
        client.paymentPlan = undefined;
    } else if (quote.flow === BusinessFlow.VentaPlazo || quote.flow === BusinessFlow.VentaDirecta) {
        client.paymentPlan = {
            monthlyGoal: quote.monthlyPayment,
            currentMonthProgress: 0,
            currency: 'MXN',
            methods: { collection: false, voluntary: true }
        };
        client.savingsPlan = undefined;
        client.downPayment = quote.downPayment;
        client.remainderAmount = quote.amountToFinance;
    }

    const newEvent = {
        id: `evt-${clientId}-${Date.now()}`,
        timestamp: new Date(),
        message: `Plan de ${quote.flow} formalizado con un valor de ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(quote.totalPrice)}.`,
        actor: Actor.Asesor,
        type: EventType.AdvisorAction
    };

    client.events = [newEvent, ...client.events];
    clientsDB.set(clientId, client);
    return mockApi(client);
  },

  getOpportunityStages: (market: Market = 'all'): Promise<OpportunityStage[]> => {
    const clients = getFilteredClients(market);
    const stages: OpportunityStage[] = [ { name: 'Nuevas Oportunidades', clientIds: [], count: 0 }, { name: 'Expediente en Proceso', clientIds: [], count: 0 }, { name: 'Aprobado', clientIds: [], count: 0 }, { name: 'Activo', clientIds: [], count: 0 }, { name: 'Completado', clientIds: [], count: 0 }, ];
    clients.forEach(client => { 
        if (client.status === 'Nuevas Oportunidades') { 
            stages[0].clientIds.push(client.id); 
        } else if (client.status === 'Expediente en Proceso') { 
            stages[1].clientIds.push(client.id); 
        } else if (client.status === 'Aprobado') { 
            stages[2].clientIds.push(client.id); 
        } else if (['Activo', 'Pagos al Corriente', 'Activo en Grupo', 'Esperando Sorteo'].includes(client.status)) { 
            stages[3].clientIds.push(client.id); 
        } else if (['Meta Alcanzada', 'Turno Adjudicado', 'Completado', 'Unidad Lista para Entrega'].includes(client.status)) {
             stages[4].clientIds.push(client.id); 
        } 
    });
    stages.forEach(stage => stage.count = stage.clientIds.length);
    return mockApi(stages, 900);
  },
  
  getActionableGroups: (market: Market = 'all'): Promise<ActionableGroup[]> => {
    const clients = getFilteredClients(market);    
    const groups: Record<string, ActionableGroup> = { 'expediente': { title: "Expedientes Incompletos", description: "Clientes que han iniciado pero tienen documentos pendientes de subir.", clients: [] }, 'meta': { title: "Metas de Ahorro Alcanzadas", description: "Estos clientes están listos para ser convertidos a Venta a Plazo o liquidar.", clients: [] }, 'aprobado': { title: "Aprobados, Esperando Configuración", description: "Créditos aprobados que necesitan la configuración del plan de pagos.", clients: [] }, };
    clients.forEach(c => { const actionableClient: ActionableClient = { id: c.id, name: c.name, avatarUrl: c.avatarUrl, status: c.status }; if (c.status === 'Expediente en Proceso') { groups['expediente'].clients.push(actionableClient); } else if (c.status === 'Meta Alcanzada') { groups['meta'].clients.push(actionableClient); } else if (c.status === 'Aprobado') { groups['aprobado'].clients.push(actionableClient); } });
    const result = Object.values(groups).filter(g => g.clients.length > 0);
    return mockApi(result, 1200);
  },
  
  generatePaymentLink: (clientId: string, amount: number): Promise<PaymentLinkDetails> => {
    console.log(`Generating payment link for client ${clientId} with amount ${amount}`);
    if (amount <= 20000) {
      return mockApi({
        type: 'Conekta',
        amount,
        details: { link: `https://pay.conekta.com/link/${Math.random().toString(36).substring(7)}` }
      }, 1500);
    } else {
      return mockApi({
        type: 'SPEI',
        amount,
        details: {
          clabe: '012180001234567895',
          reference: `CLI${clientId.padStart(4,'0')}${Date.now() % 10000}`,
          bank: 'STP'
        }
      }, 1500);
    }
  },
  
  uploadDocument: (clientId: string, docId: string): Promise<Document> => {
      const client = clientsDB.get(clientId);
      const doc = client?.documents.find(d => d.id === docId);
      if(doc && client){
          doc.status = DocumentStatus.EnRevision;
          clientsDB.set(clientId, client);
          return mockApi(doc, 2000);
      }
      return Promise.reject("Document not found");
  },
  simulateClientPayment: (clientId: string, amount: number): Promise<Client> => {
    const client = clientsDB.get(clientId);
    if (!client || !client.savingsPlan) return Promise.reject("Client or savings plan not found");
    client.savingsPlan.progress += amount;
    if (client.savingsPlan.progress >= client.savingsPlan.goal) {
      client.status = "Meta Alcanzada";
      client.healthScore = 98;
    }
    clientsDB.set(clientId, client);
    return mockApi(client, 1000);
  },
  simulateMonthlyPayment: (clientId: string, amount: number): Promise<Client> => {
    const client = clientsDB.get(clientId);
    if (!client || !client.paymentPlan) return Promise.reject("Client or payment plan not found");
    client.paymentPlan.currentMonthProgress += amount;
    clientsDB.set(clientId, client);
    return mockApi(client, 1000);
  },
  convertToVentaPlazo: (clientId: string): Promise<Client> => {
    const client = clientsDB.get(clientId);
    if (!client) return Promise.reject("Client not found");
    client.flow = BusinessFlow.VentaPlazo;
    client.status = "Aprobado";
    client.healthScore = 95;
    client.documents = [
      ...client.documents,
      { id: `${clientId}-vp1`, name: 'Constancia de situación fiscal', status: DocumentStatus.Pendiente, isOptional: true },
      { id: `${clientId}-vp2`, name: 'Factura de la unidad actual', status: DocumentStatus.Pendiente },
      { id: `${clientId}-vp3`, name: 'Carta Aval de Ruta', status: DocumentStatus.Pendiente },
      { id: `${clientId}-vp4`, name: 'Convenio de Dación en Pago', status: DocumentStatus.Pendiente },
    ];
    clientsDB.set(clientId, client);
    return mockApi(client, 1000);
  },
  sendContract: (clientId: string): Promise<{ message: string }> => {
    const client = clientsDB.get(clientId);
    if (!client) return Promise.reject("Client not found");

    const isEdoMex = !!client.ecosystemId;
    let message = '';

    if (client.flow === BusinessFlow.VentaPlazo) {
      if (isEdoMex) {
        message = `Paquete de Venta (Contrato y Dación en Pago) enviado a ${client.name} para firma.`;
      } else { // Aguascalientes
        message = `Contrato de Venta a Plazo enviado a ${client.name} para firma.`;
      }
    } else { // VentaDirecta or other flows
      message = `Contrato Promesa de Compraventa enviado a ${client.name} para firma.`;
    }
    
    return mockApi({ message }, 1200);
  },
  completeKyc: (clientId: string): Promise<Client> => {
    const client = clientsDB.get(clientId);
    if (!client) return Promise.reject("Client not found");
    const kycDoc = client.documents.find(d => d.name.includes('Verificación Biométrica'));
    if (kycDoc) kycDoc.status = DocumentStatus.Aprobado;
    clientsDB.set(clientId, client);
    return mockApi(client);
  },
  configurePaymentPlan: (clientId: string, config: any): Promise<Client> => {
    const client = clientsDB.get(clientId);
    if (!client) return Promise.reject("Client not found");
    client.paymentPlan = {
      monthlyGoal: config.goal, currentMonthProgress: 0, currency: 'MXN', methods: config.methods,
      collectionDetails: config.methods.collection ? { plates: config.plates?.split(',').map((p:string) => p.trim()) || [], pricePerLiter: config.overprice || 0, } : undefined,
    };
    client.status = "Pagos al Corriente";
    clientsDB.set(clientId, client);
    return mockApi(client);
  },
  createCollectiveCreditGroup: (config: { name: string, capacity: number, savingsGoal: number }): Promise<CollectiveCreditGroup> => {
    const newId = `cc-${Date.now()}`;
    const newGroup: CollectiveCreditGroup = { id: newId, name: config.name, capacity: config.capacity, members: [], totalUnits: config.capacity, unitsDelivered: 0, savingsGoalPerUnit: config.savingsGoal, currentSavingsProgress: 0, monthlyPaymentPerUnit: 25720.52, currentMonthPaymentProgress: 0, };
    collectiveCreditGroupsDB.set(newId, newGroup);
    return mockApi(newGroup);
  },
  assignUnitAndTransitionToPayment: (groupId: string): Promise<CollectiveCreditGroup> => {
    const group = collectiveCreditGroupsDB.get(groupId);
    if (!group) return Promise.reject("Group not found");
    if(group.unitsDelivered < group.totalUnits) {
        group.unitsDelivered += 1;
        group.currentSavingsProgress = group.currentSavingsProgress - group.savingsGoalPerUnit; 
    }
    collectiveCreditGroupsDB.set(groupId, group);
    return mockApi(group);
  },
  getProductPackage: (market: any): Promise<any> => {
    const packages: any = { 
        // --- Aguascalientes ---
        'aguascalientes-plazo': { 
            name: "Paquete Venta a Plazo - Aguascalientes", 
            rate: 0.255, 
            terms: [12, 24], 
            minDownPaymentPercentage: 0.60, 
            components: [ 
                { id: 'vagoneta_19p', name: 'Vagoneta H6C (19 Pasajeros)', price: 799000, isOptional: false }, 
                { id: 'gnv', name: 'Conversión GNV', price: 54000, isOptional: false } 
            ] 
        }, 
        'aguascalientes-directa': { 
            name: "Paquete Venta Directa - Aguascalientes", 
            rate: 0, 
            terms: [], 
            minDownPaymentPercentage: 0.1, 
            components: [ 
                { id: 'vagoneta_19p', name: 'Vagoneta H6C (19 Pasajeros)', price: 799000, isOptional: false }, 
                { id: 'gnv', name: 'Conversión GNV', price: 54000, isOptional: true } 
            ] 
        }, 
        // --- Estado de México ---
        'edomex-plazo': { 
            name: "Paquete Venta a Plazo (Individual) - EdoMex", 
            rate: 0.299, 
            terms: [48, 60], 
            minDownPaymentPercentage: 0.20, 
            components: [ 
                { id: 'vagoneta_ventanas', name: 'Vagoneta H6C (Ventanas)', price: 749000, isOptional: false }, 
                { id: 'gnv', name: 'Conversión GNV', price: 54000, isOptional: false }, 
                { id: 'tec', name: 'Paquete Tec (GPS, Cámaras)', price: 12000, isOptional: false }, 
                { id: 'bancas', name: 'Bancas', price: 22000, isOptional: false }, 
                { id: 'seguro', name: 'Seguro Anual', price: 36700, isOptional: false, isMultipliedByTerm: true } 
            ] 
        }, 
        'edomex-directa': { 
            name: "Paquete Venta Directa - EdoMex", 
            rate: 0, 
            terms: [], 
            minDownPaymentPercentage: 0.1, 
            components: [ 
                { id: 'vagoneta_ventanas', name: 'Vagoneta H6C (Ventanas)', price: 749000, isOptional: false },
                { id: 'paquete-productivo', name: 'Paquete Productivo Completo (GNV, Tec, Bancas)', price: 88000, isOptional: true }
            ] 
        }, 
        'edomex-colectivo': { 
            name: "Paquete Crédito Colectivo - EdoMex", 
            rate: 0.299, 
            terms: [60], 
            minDownPaymentPercentage: 0.15, 
            defaultMembers: 5, 
            components: [ 
                { id: 'vagoneta_ventanas', name: 'Vagoneta H6C (Ventanas)', price: 749000, isOptional: false }, 
                { id: 'gnv', name: 'Conversión GNV', price: 54000, isOptional: false }, 
                { id: 'tec', name: 'Paquete Tec (GPS, Cámaras)', price: 12000, isOptional: false }, 
                { id: 'bancas', name: 'Bancas', price: 22000, isOptional: false }, 
                { id: 'seguro', name: 'Seguro Anual', price: 36700, isOptional: false, isMultipliedByTerm: true } 
            ] 
        } 
    };
    return mockApi(packages[market], 600);
  },
  saveQuote: (quoteData: any): Promise<{success: boolean, quoteId: string}> => {
      console.log("Saving quote to backend:", quoteData);
      return mockApi({ success: true, quoteId: `QT-${Date.now()}`}, 1200);
  },
  createVentaDirectaClient: (quoteData: any): Promise<Client> => {
    const newId = `vd-${Date.now()}`;
    const newClient: Client = { id: newId, name: 'Nuevo Cliente Venta Directa', avatarUrl: `https://picsum.photos/seed/${newId}/100/100`, flow: BusinessFlow.VentaDirecta, status: 'Expediente en Proceso', healthScore: 72, documents: CONTADO_DOCS, events: [{ id: `${newId}-evt-1`, timestamp: new Date(), message: 'Oportunidad de Venta Directa creada.', actor: Actor.Asesor, type: EventType.AdvisorAction }], downPayment: quoteData.downPayment, remainderAmount: quoteData.remainder, importStatus: { pedidoPlanta: 'pending', unidadFabricada: 'pending', transitoMaritimo: 'pending', enAduana: 'pending', liberada: 'pending', } };
    clientsDB.set(newId, newClient);
    return mockApi(newClient);
  },
  updateImportMilestone: (clientId: string, milestone: keyof ImportStatus): Promise<Client> => {
    const client = clientsDB.get(clientId);
    if (!client || !client.importStatus) return Promise.reject("Client or import status not found");
    const milestoneOrder: (keyof ImportStatus)[] = ['pedidoPlanta', 'unidadFabricada', 'transitoMaritimo', 'enAduana', 'liberada'];
    const currentIndex = milestoneOrder.indexOf(milestone);
    
    // Mark previous milestones as completed
    for (let i = 0; i < currentIndex; i++) {
        client.importStatus[milestoneOrder[i]] = 'completed';
    }

    client.importStatus[milestone] = 'in_progress';

    if (milestone === 'liberada') {
        client.importStatus.liberada = 'completed';
        client.status = 'Unidad Lista para Entrega';
        client.healthScore = 99;
    }

    clientsDB.set(clientId, client);
    return mockApi(client);
  },
  getSimulatedAlert: (clients: Client[]): Promise<Notification | null> => {
    if (clients.length === 0) return mockApi(null);
    const randomClient = clients[Math.floor(Math.random() * clients.length)];
    const alertTemplates: Array<Omit<Notification, 'id' | 'timestamp'>> = [ { type: NotificationType.Lead, message: `Nuevo Lead Asignado: ${randomClient.name}`, clientId: randomClient.id }, { type: NotificationType.Milestone, message: `¡Contrato Firmado! ${randomClient.name} ha firmado.`, clientId: randomClient.id }, { type: NotificationType.Risk, message: `Seguimiento Requerido: ${randomClient.name} lleva 3 días en 'Expediente en Proceso'.`, clientId: randomClient.id }, { type: NotificationType.System, message: `Actualización del sistema programada para medianoche.` }, ];
    const goalAchievedClient = clients.find(c => c.status === 'Meta Alcanzada');
    if(goalAchievedClient) alertTemplates.push({ type: NotificationType.Milestone, message: `¡Meta Alcanzada! ${goalAchievedClient.name} está listo para convertir.`, clientId: goalAchievedClient.id, action: { text: 'Iniciar Conversión', type: 'convert' } });
    const approvedClient = clients.find(c => c.status === 'Aprobado');
    if(approvedClient) alertTemplates.push({ type: NotificationType.Milestone, message: `Crédito Aprobado para ${approvedClient.name}.`, clientId: approvedClient.id, action: { text: 'Configurar Plan', type: 'configure_plan' } });
    const randomAlert = alertTemplates[Math.floor(Math.random() * alertTemplates.length)];
    const newNotification: Notification = { id: notificationId++, timestamp: new Date(), ...randomAlert };
    return mockApi(newNotification, 200);
  },
  getSidebarAlertCounts: (clients: Client[]): Promise<{ [key in View]?: number }> => {
    const counts: { [key in View]?: number } = {
        oportunidades: clients.filter(c => c.status === 'Nuevas Oportunidades').length,
        clientes: clients.filter(c => ['Expediente en Proceso', 'Aprobado', 'Meta Alcanzada'].includes(c.status)).length,
    };
    return mockApi(counts, 150);
  },
  simulateRestructure: (clientId: string, months: number): Promise<ProtectionScenario[]> => {
    const client = clientsDB.get(clientId);
    if (!client || !client.paymentPlan || !client.remainderAmount) {
        return Promise.reject("Client not suitable for restructure");
    }

    const P = client.remainderAmount;
    const M = client.paymentPlan.monthlyGoal;
    const r = 0.255 / 12; 
    const originalTerm = 48; // Assume 48 months for simulation
    const paymentEvents = client.events.filter(e => e.type === EventType.Contribution || e.type === EventType.Collection).length;
    const monthsPaid = Math.floor(paymentEvents / 2); // very rough estimate
    const remainingTerm = originalTerm - monthsPaid;

    if (remainingTerm <= months) {
        return Promise.resolve([]);
    }
    
    const B_k = getBalance(P, M, r, monthsPaid);
    const scenarios: ProtectionScenario[] = [];

    // Scenario A: Pausa y Prorrateo (Deferral)
    const newRemainingTerm_A = remainingTerm - months;
    const newPayment_A = annuity(B_k, r, newRemainingTerm_A);
    scenarios.push({
        type: 'defer',
        title: 'Pausa y Prorrateo',
        description: 'Pausa los pagos y distribuye el monto en las mensualidades restantes.',
        newMonthlyPayment: newPayment_A,
        newTerm: originalTerm,
        termChange: 0,
        details: [`Pagos de $0 por ${months} meses`, `El pago mensual sube a ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(newPayment_A)} después.`]
    });

    // Scenario B: Reducción y Compensación (Step-down)
    const reducedPayment = M * 0.5;
    const principalAfterStepDown = getBalance(B_k, reducedPayment, r, months);
    const compensationPayment = annuity(principalAfterStepDown, r, remainingTerm - months);
    scenarios.push({
        type: 'step-down',
        title: 'Reducción y Compensación',
        description: 'Reduce el pago a la mitad y compensa la diferencia más adelante.',
        newMonthlyPayment: compensationPayment,
        newTerm: originalTerm,
        termChange: 0,
        details: [`Pagos de ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(reducedPayment)} por ${months} meses`, `El pago sube a ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(compensationPayment)} después.`]
    });

    // Scenario C: Extensión de Plazo
    const newTerm_C = originalTerm + months;
    scenarios.push({
        type: 'recalendar',
        title: 'Extensión de Plazo',
        description: 'Pausa los pagos y extiende el plazo del crédito para compensar.',
        newMonthlyPayment: M,
        newTerm: newTerm_C,
        termChange: months,
        details: [`Pagos de $0 por ${months} meses`, `El plazo se extiende en ${months} meses.`]
    });

    return mockApi(scenarios, 1500);
  },
  applyRestructure: (clientId: string, scenario: ProtectionScenario): Promise<Client> => {
      const client = clientsDB.get(clientId);
      if (!client || !client.paymentPlan || !client.protectionPlan) {
          return Promise.reject("Client not found or not eligible");
      }
      
      client.paymentPlan.monthlyGoal = scenario.newMonthlyPayment;
      client.protectionPlan.restructuresUsed += 1;
      client.protectionPlan.restructuresAvailable -= 1;

      const newEvent: EventLog = {
          id: `evt-${clientId}-${Date.now()}`,
          timestamp: new Date(),
          message: `Restructura de tipo "${scenario.title}" aplicada.`,
          actor: Actor.Asesor,
          type: EventType.AdvisorAction,
      };
      client.events.unshift(newEvent);
      clientsDB.set(clientId, client);
      return mockApi(client);
  },
  simulateProtectionDemo: (baseQuote: { amountToFinance: number; monthlyPayment: number; term: number }, monthsToSimulate: number): Promise<ProtectionScenario[]> => {
    const { amountToFinance: P, monthlyPayment: M, term: originalTerm } = baseQuote;
    
    // Assume a constant rate for demo purposes
    const r = 0.255 / 12; 
    
    // Simulate what protection looks like 1 year (12 months) into the loan
    const monthsPaid = 12;
    
    // The simulation only makes sense if there are enough months left in the term
    const remainingTerm = originalTerm - monthsPaid;
    if (remainingTerm <= monthsToSimulate) {
        return Promise.resolve([]);
    }
    
    // Get the outstanding balance after 12 payments
    const B_k = getBalance(P, M, r, monthsPaid);
    const scenarios: ProtectionScenario[] = [];

    // Scenario A: Deferral
    const newRemainingTerm_A = remainingTerm - monthsToSimulate;
    const newPayment_A = annuity(B_k, r, newRemainingTerm_A);
    scenarios.push({
        type: 'defer',
        title: 'Pausa y Prorrateo',
        description: 'Pausa los pagos y distribuye el monto en las mensualidades restantes.',
        newMonthlyPayment: newPayment_A,
        newTerm: originalTerm,
        termChange: 0,
        details: [`Pagos de $0 por ${monthsToSimulate} meses`, `El pago mensual sube a ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(newPayment_A)} después.`]
    });

    // Scenario B: Step-down
    const reducedPayment = M * 0.5;
    const principalAfterStepDown = getBalance(B_k, reducedPayment, r, monthsToSimulate);
    const compensationPayment = annuity(principalAfterStepDown, r, remainingTerm - monthsToSimulate);
    scenarios.push({
        type: 'step-down',
        title: 'Reducción y Compensación',
        description: 'Reduce el pago a la mitad y compensa la diferencia más adelante.',
        newMonthlyPayment: compensationPayment,
        newTerm: originalTerm,
        termChange: 0,
        details: [`Pagos de ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(reducedPayment)} por ${monthsToSimulate} meses`, `El pago sube a ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(compensationPayment)} después.`]
    });

    // Scenario C: Recalendar (Term Extension)
    const newTerm_C = originalTerm + monthsToSimulate;
    scenarios.push({
        type: 'recalendar',
        title: 'Extensión de Plazo',
        description: 'Pausa los pagos y extiende el plazo del crédito para compensar.',
        newMonthlyPayment: M,
        newTerm: newTerm_C,
        termChange: monthsToSimulate,
        details: [`Pagos de $0 por ${monthsToSimulate} meses`, `El plazo se extiende en ${monthsToSimulate} meses.`]
    });

    return mockApi(scenarios, 1500);
  },
  simulateTanda: (groupInput: TandaGroupInput, config: TandaSimConfig): Promise<TandaSimulationResult> => {
    let savings = 0;
    const debtSet = new Map<string, number>(); // memberId -> monthly payment (MDS)
    const queue = [...groupInput.members].filter(m => m.status === 'active').sort((a, b) => a.prio - b.prio);
    const months: TandaMonthState[] = [];
    const awards: TandaAward[] = [];
    const awardsByMember: Record<string, TandaAward> = {};
    const monthlyRate = groupInput.product.rateAnnual / 12;

    for (let t = 1; t <= config.horizonMonths; t++) {
      const monthEvents = config.events.filter(e => e.t === t);
      const contributions = new Map<string, number>(groupInput.members.map(m => [m.id, m.C]));
      
      monthEvents.forEach(event => {
        if (event.type === 'extra') {
          contributions.set(event.data.memberId, (contributions.get(event.data.memberId) || 0) + event.data.amount);
        } else if (event.type === 'miss') {
          contributions.set(event.data.memberId, (contributions.get(event.data.memberId) || 0) - event.data.amount);
        }
      });
      
      const inflow = Array.from(contributions.values()).reduce((sum, c) => sum + c, 0);
      const debtDue = Array.from(debtSet.values()).reduce((sum, d) => sum + d, 0);
      let deficit = 0;
      let riskBadge: TandaRiskBadge = 'ok';

      if (inflow >= debtDue) {
        savings += (inflow - debtDue);
      } else {
        deficit = debtDue - inflow;
        riskBadge = 'debtDeficit';
      }

      const monthAwards: TandaAward[] = [];
      const downPayment = groupInput.product.price * groupInput.product.dpPct + (groupInput.product.fees || 0);

      while (riskBadge !== 'debtDeficit' && savings >= downPayment && queue.length > 0) {
        const nextMember = queue.shift();
        if (!nextMember) break;

        const isEligible = !groupInput.rules.eligibility.requireThisMonthPaid || (contributions.get(nextMember.id) || 0) >= groupInput.members.find(m => m.id === nextMember.id)!.C;
        
        if (isEligible) {
            const principal = groupInput.product.price * (1 - groupInput.product.dpPct);
            const mds = annuity(principal, monthlyRate, groupInput.product.term);
            debtSet.set(nextMember.id, mds);
            savings -= downPayment;
            
            const award: TandaAward = { memberId: nextMember.id, name: nextMember.name, month: t, mds };
            monthAwards.push(award);
            awards.push(award);
            awardsByMember[nextMember.id] = award;
        } else {
            queue.push(nextMember); // Put back at the end of the queue for this month
            break; // Stop trying to award this month
        }
      }
      
      months.push({ t, inflow, debtDue, deficit, savings, awards: monthAwards, riskBadge });
    }

    const deliveredCount = awards.length;
    const totalTimeToAward = awards.reduce((sum, a) => sum + a.month, 0);
    const result: TandaSimulationResult = {
      months,
      awardsByMember,
      firstAwardT: awards[0]?.month,
      lastAwardT: awards[awards.length - 1]?.month,
      kpis: {
        coverageRatioMean: months.reduce((sum, m) => sum + (m.debtDue > 0 ? m.inflow / m.debtDue : 1), 0) / months.length,
        deliveredCount,
        avgTimeToAward: deliveredCount > 0 ? totalTimeToAward / deliveredCount : 0,
      }
    };

    return mockApi(result, 1500);
  },
};
import { TandaGroupInput, TandaSimConfig, TandaSimulationResult } from '../types';
import { simulationService } from './simulationService';

interface SeniorSummaryData {
  ahorroHoy: number;
  siguienteMes: number;
  extraSugerido: number;
  avanceMeses: number;
}

interface WhatsListItem {
  tipo: 'entrega' | 'ahorro';
  n: number;
  mes?: number;
  persona?: string;
  acum?: number;
  faltan?: number;
}

interface TimelineEntrega {
  mes: number;
  miembro: string;
  unitNumber: number;
}

// Simulates the effect of adding extra contribution to all members
export const simulateWithDelta = async (
  originalGroup: TandaGroupInput, 
  config: TandaSimConfig, 
  deltaAmount: number = 500
): Promise<{ original: TandaSimulationResult; withDelta: TandaSimulationResult }> => {
  
  // Run original simulation
  const original = await simulationService.simulateTanda(originalGroup, config);
  
  // Create modified group with increased contributions
  const modifiedGroup: TandaGroupInput = {
    ...originalGroup,
    members: originalGroup.members.map(member => ({
      ...member,
      C: member.C + deltaAmount
    }))
  };
  
  // Run simulation with delta
  const withDelta = await simulationService.simulateTanda(modifiedGroup, config);
  
  return { original, withDelta };
};

// Extracts senior-friendly summary from simulation result
export const extractSeniorSummary = (
  result: TandaSimulationResult,
  originalResult?: TandaSimulationResult,
  deltaAmount: number = 500
): SeniorSummaryData => {
  
  const currentMonth = 1; // Could be dynamic based on actual progress
  const currentSavings = result.months[currentMonth - 1]?.savings || 0;
  const nextDeliveryMonth = result.firstAwardT || result.months.find(m => m.awards.length > 0)?.t || 0;
  
  // Calculate impact of extra contribution
  let monthsAdvanced = 0;
  if (originalResult && result.firstAwardT && originalResult.firstAwardT) {
    monthsAdvanced = Math.max(0, originalResult.firstAwardT - result.firstAwardT);
  }
  
  return {
    ahorroHoy: currentSavings,
    siguienteMes: nextDeliveryMonth,
    extraSugerido: deltaAmount,
    avanceMeses: monthsAdvanced
  };
};

// Converts simulation result to WhatsApp-style list items
export const extractWhatsListItems = (result: TandaSimulationResult): WhatsListItem[] => {
  const items: WhatsListItem[] = [];
  
  // Add delivery events
  const deliveries = result.months
    .filter(month => month.awards.length > 0)
    .flatMap(month => 
      month.awards.map((award, index) => ({
        tipo: 'entrega' as const,
        n: index + 1,
        mes: month.t,
        persona: award.name
      }))
    )
    .slice(0, 5); // Limit to first 5 deliveries
  
  items.push(...deliveries);
  
  // Add savings milestones (simulated based on months without deliveries)
  const savingsMonths = result.months
    .filter(month => month.awards.length === 0 && month.savings > 0)
    .slice(0, 3)
    .map((month, index) => ({
      tipo: 'ahorro' as const,
      n: index + 1,
      acum: month.savings,
      faltan: Math.max(0, (result.months[0]?.debtDue || 0) - month.savings)
    }));
  
  items.push(...savingsMonths);
  
  // Sort by month for chronological order
  return items.sort((a, b) => (a.mes || 0) - (b.mes || 0));
};

// Extracts timeline delivery data
export const extractTimelineEntregas = (result: TandaSimulationResult): TimelineEntrega[] => {
  return result.months
    .filter(month => month.awards.length > 0)
    .flatMap(month => 
      month.awards.map((award, index) => ({
        mes: month.t,
        miembro: award.name,
        unitNumber: index + 1
      }))
    );
};

// Text-to-Speech functionality
export const speakSummary = (summaryData: SeniorSummaryData): void => {
  if ('speechSynthesis' in window) {
    const text = `Hoy tienen ${summaryData.ahorroHoy.toLocaleString()} pesos ahorrado. 
                  Siguiente entrega: mes ${summaryData.siguienteMes}. 
                  Si ponen ${summaryData.extraSugerido} pesos más este mes, adelantan ${summaryData.avanceMeses} mes.`;
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-MX';
    utterance.rate = 0.8; // Slower for clarity
    speechSynthesis.speak(utterance);
  }
};

// Generate WhatsApp-ready summary text
export const generateWhatsAppSummary = (
  summaryData: SeniorSummaryData,
  groupName: string,
  items: WhatsListItem[]
): string => {
  const header = `🚛 *${groupName}* - Resumen de Tanda\n\n`;
  
  const summary = `📊 *Estado Actual:*\n` +
    `• Ahorro de hoy: $${summaryData.ahorroHoy.toLocaleString()}\n` +
    `• Siguiente entrega: mes ${summaryData.siguienteMes}\n` +
    `• Con $${summaryData.extraSugerido} más: adelantan ${summaryData.avanceMeses} mes\n\n`;
  
  const events = `📅 *Próximos Eventos:*\n` +
    items.slice(0, 4).map(item => {
      if (item.tipo === 'entrega') {
        return `✅ Entrega #${item.n} - mes ${item.mes} - ${item.persona}`;
      } else {
        return `💙 Ahorro #${item.n} - $${(item.acum || 0).toLocaleString()} acumulado`;
      }
    }).join('\n') + '\n\n';
  
  const footer = `📱 Generado con Conductores del Mundo`;
  
  return header + summary + events + footer;
};
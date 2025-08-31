// Enhanced version of simulationService with advanced TIR calculations and policy validations
// This integrates the advanced financial functions while maintaining all existing functionality

import { generateScenarioWithTIR, getBalance } from './advancedFinancials';
import { Client, ProtectionScenario, TandaGroupInput, TandaSimConfig, TandaSimulationResult, TandaMonthState, TandaAward, TandaRiskBadge, EventType, Actor } from '../types';

// Basic annuity calculation
const annuity = (principal: number, monthlyRate: number, term: number): number => {
    if (term <= 0) return principal;
    if (monthlyRate <= 0) return principal / term;
    return (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -term));
};

// Enhanced simulateRestructure with advanced TIR calculations
export const simulateRestructureEnhanced = (client: Client, months: number, market?: string): Promise<ProtectionScenario[]> => {
    if (!client.paymentPlan || !client.remainderAmount) {
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

    // Scenario A: Pausa y Prorrateo (Deferral) with TIR validation
    const scenarioA = generateScenarioWithTIR(
        'defer',
        'Pausa y Prorrateo',
        'Pausa los pagos y distribuye el monto en las mensualidades restantes.',
        B_k,
        r,
        M,
        remainingTerm,
        months,
        1, // reductionFactor
        market
    );
    if (scenarioA) scenarios.push(scenarioA);

    // Scenario B: Reducción y Compensación (Step-down) with TIR validation
    const scenarioB = generateScenarioWithTIR(
        'step-down',
        'Reducción y Compensación',
        'Reduce el pago a la mitad y compensa la diferencia más adelante.',
        B_k,
        r,
        M,
        remainingTerm,
        months,
        0.5, // 50% reduction
        market
    );
    if (scenarioB) scenarios.push(scenarioB);

    // Scenario C: Extensión de Plazo with TIR validation
    const scenarioC = generateScenarioWithTIR(
        'recalendar',
        'Extensión de Plazo',
        'Pausa los pagos y extiende el plazo del crédito para compensar.',
        B_k,
        r,
        M,
        remainingTerm,
        months,
        1, // reductionFactor
        market
    );
    if (scenarioC) scenarios.push(scenarioC);

    return Promise.resolve(scenarios);
};

// Enhanced simulateProtectionDemo with advanced TIR calculations
export const simulateProtectionDemoEnhanced = (baseQuote: { amountToFinance: number; monthlyPayment: number; term: number }, monthsToSimulate: number, market?: string): Promise<ProtectionScenario[]> => {
    const { amountToFinance: P, monthlyPayment: M, term: originalTerm } = baseQuote;
    
    const r = 0.255 / 12; 
    const monthsPaid = 12; // Simulate what protection looks like 1 year into the loan
    const remainingTerm = originalTerm - monthsPaid;
    
    if (remainingTerm <= monthsToSimulate) {
        return Promise.resolve([]);
    }
    
    const B_k = getBalance(P, M, r, monthsPaid);
    const scenarios: ProtectionScenario[] = [];

    // Scenario A: Deferral with TIR validation
    const scenarioA = generateScenarioWithTIR(
        'defer',
        'Pausa y Prorrateo',
        'Pausa los pagos y distribuye el monto en las mensualidades restantes.',
        B_k,
        r,
        M,
        remainingTerm,
        monthsToSimulate,
        1, // reductionFactor
        market
    );
    if (scenarioA) scenarios.push(scenarioA);

    // Scenario B: Step-down with TIR validation
    const scenarioB = generateScenarioWithTIR(
        'step-down',
        'Reducción y Compensación',
        'Reduce el pago a la mitad y compensa la diferencia más adelante.',
        B_k,
        r,
        M,
        remainingTerm,
        monthsToSimulate,
        0.5, // 50% reduction
        market
    );
    if (scenarioB) scenarios.push(scenarioB);

    // Scenario C: Recalendar (Term Extension) with TIR validation
    const scenarioC = generateScenarioWithTIR(
        'recalendar',
        'Extensión de Plazo',
        'Pausa los pagos y extiende el plazo del crédito para compensar.',
        B_k,
        r,
        M,
        remainingTerm,
        monthsToSimulate,
        1, // reductionFactor
        market
    );
    if (scenarioC) scenarios.push(scenarioC);

    return Promise.resolve(scenarios);
};

// Enhanced Tanda simulation with advanced event types
export const simulateTandaEnhanced = (groupInput: TandaGroupInput, config: TandaSimConfig): Promise<TandaSimulationResult> => {
    let savings = 0;
    const debtSet = new Map<string, number>(); // memberId -> monthly payment (MDS)
    const queue = [...groupInput.members].filter(m => m.status === 'active').sort((a, b) => a.prio - b.prio);
    const months: TandaMonthState[] = [];
    const awards: TandaAward[] = [];
    const awardsByMember: Record<string, TandaAward> = {};
    const monthlyRate = groupInput.product.rateAnnual / 12;

    // Track member status for advanced events
    const memberStatus = new Map<string, 'active' | 'frozen' | 'left' | 'delivered'>();
    groupInput.members.forEach(m => memberStatus.set(m.id, m.status));

    for (let t = 1; t <= config.horizonMonths; t++) {
        const monthEvents = config.events.filter(e => e.t === t);
        const contributions = new Map<string, number>(groupInput.members.map(m => [m.id, m.C]));
        
        // Process advanced events
        monthEvents.forEach(event => {
            switch (event.type) {
                case 'extra':
                    contributions.set(event.data.memberId, (contributions.get(event.data.memberId) || 0) + event.data.amount);
                    break;
                case 'miss':
                    contributions.set(event.data.memberId, (contributions.get(event.data.memberId) || 0) - event.data.amount);
                    break;
                case 'rescue':
                    // Rescue event - emergency payment to prevent default
                    const rescueAmount = event.data.amount;
                    savings += rescueAmount;
                    break;
                case 'change_price':
                    // Price change affects future calculations
                    // This would require more complex implementation with state tracking
                    break;
                case 'freeze':
                    memberStatus.set(event.data.memberId, 'frozen');
                    contributions.set(event.data.memberId, 0); // No contributions while frozen
                    break;
                case 'unfreeze':
                    memberStatus.set(event.data.memberId, 'active');
                    break;
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

        // Only consider active members for awards
        const activeQueue = queue.filter(member => memberStatus.get(member.id) === 'active');

        while (riskBadge !== 'debtDeficit' && savings >= downPayment && activeQueue.length > 0) {
            const nextMember = activeQueue.shift();
            if (!nextMember) break;

            const isEligible = !groupInput.rules.eligibility.requireThisMonthPaid || 
                              (contributions.get(nextMember.id) || 0) >= groupInput.members.find(m => m.id === nextMember.id)!.C;
            
            if (isEligible) {
                const principal = groupInput.product.price * (1 - groupInput.product.dpPct);
                const mds = annuity(principal, monthlyRate, groupInput.product.term);
                debtSet.set(nextMember.id, mds);
                savings -= downPayment;
                
                // Mark member as delivered
                memberStatus.set(nextMember.id, 'delivered');
                
                const award: TandaAward = { memberId: nextMember.id, name: nextMember.name, month: t, mds };
                monthAwards.push(award);
                awards.push(award);
                awardsByMember[nextMember.id] = award;
            } else {
                activeQueue.push(nextMember); // Put back at the end of the queue for this month
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

    return Promise.resolve(result);
};

// Export enhanced functions to be integrated into the main simulation service
export {
    simulateRestructureEnhanced as enhancedSimulateRestructure,
    simulateProtectionDemoEnhanced as enhancedSimulateProtectionDemo,
    simulateTandaEnhanced as enhancedSimulateTanda
};
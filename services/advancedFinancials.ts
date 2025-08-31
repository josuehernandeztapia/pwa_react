import { ProtectionScenario } from '../types';

// --- Advanced Financial Functions for TIR and Policy Validation ---
export const TIR_MIN_AGS = 0.255; // Aguascalientes rate (25.5% annual)
export const TIR_MIN_EDOMEX = 0.299; // Estado de México rate (29.9% annual)
export const difMaxMeses = 6; // Maximum months for deferral
export const stepDownMaxPct = 0.5; // Maximum reduction percentage for step-down

// Helper function to get TIR minimum based on market
export const getTIRMin = (market?: 'aguascalientes' | 'edomex' | string): number => {
    if (market === 'aguascalientes') return TIR_MIN_AGS;
    if (market === 'edomex') return TIR_MIN_EDOMEX;
    return TIR_MIN_AGS; // Default fallback
};

// Newton-Raphson method for TIR calculation
export const calculateTIR = (cashFlows: number[], guess: number = 0.1, tolerance: number = 1e-6, maxIterations: number = 100): number => {
    let rate = guess;
    
    for (let i = 0; i < maxIterations; i++) {
        let npv = 0;
        let npvDerivative = 0;
        
        for (let t = 0; t < cashFlows.length; t++) {
            const denominator = Math.pow(1 + rate, t);
            npv += cashFlows[t] / denominator;
            npvDerivative -= (t * cashFlows[t]) / Math.pow(1 + rate, t + 1);
        }
        
        if (Math.abs(npv) < tolerance) {
            return rate;
        }
        
        if (Math.abs(npvDerivative) < tolerance) {
            break; // Avoid division by zero
        }
        
        rate = rate - npv / npvDerivative;
        
        // Bound the rate to reasonable values
        rate = Math.max(-0.99, Math.min(rate, 10));
    }
    
    return rate;
};

// Generate cash flow array for scenario analysis
export const generateCashFlows = (principal: number, payments: number[], term: number): number[] => {
    const flows = new Array(term + 1).fill(0);
    flows[0] = -principal; // Initial disbursement (negative)
    
    for (let i = 1; i <= term && i - 1 < payments.length; i++) {
        flows[i] = payments[i - 1] || 0; // Monthly payments (positive)
    }
    
    return flows;
};

// Capitalize interest for deferral scenarios
export const capitalizeInterest = (principal: number, monthlyRate: number, deferralMonths: number): number => {
    return principal * Math.pow(1 + monthlyRate, deferralMonths);
};

// Validate scenario against policy limits
export const validateScenarioPolicy = (scenarioType: string, months: number, reductionPct?: number): { valid: boolean; reason?: string } => {
    switch (scenarioType) {
        case 'defer':
            if (months > difMaxMeses) {
                return { valid: false, reason: `El diferimiento no puede exceder ${difMaxMeses} meses. Solicitado: ${months} meses.` };
            }
            break;
        case 'step-down':
            if (reductionPct && reductionPct > stepDownMaxPct) {
                return { valid: false, reason: `La reducción no puede exceder ${(stepDownMaxPct * 100).toFixed(0)}%. Solicitado: ${(reductionPct * 100).toFixed(0)}%.` };
            }
            break;
    }
    return { valid: true };
};

// Basic financial functions (re-exported for convenience)
export const annuity = (principal: number, monthlyRate: number, term: number): number => {
    if (term <= 0) return principal;
    if (monthlyRate <= 0) return principal / term;
    return (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -term));
};

export const getBalance = (originalPrincipal: number, originalPayment: number, monthlyRate: number, monthsPaid: number): number => {
    if (monthlyRate <= 0) return originalPrincipal - (originalPayment * monthsPaid);
    return originalPrincipal * Math.pow(1 + monthlyRate, monthsPaid) - originalPayment * (Math.pow(1 + monthlyRate, monthsPaid) - 1) / monthlyRate;
};

// Enhanced scenario generation with TIR validation
export const generateScenarioWithTIR = (
    type: string, 
    title: string, 
    description: string,
    currentBalance: number,
    monthlyRate: number,
    originalPayment: number,
    remainingTerm: number,
    affectedMonths: number,
    reductionFactor: number = 1,
    market?: 'aguascalientes' | 'edomex' | string
): ProtectionScenario | null => {
    const policyValidation = validateScenarioPolicy(type, affectedMonths, reductionFactor < 1 ? 1 - reductionFactor : undefined);
    if (!policyValidation.valid) {
        return null; // Skip invalid scenarios
    }

    let newPayment = 0;
    let newTerm = remainingTerm;
    let cashFlows: number[] = [];
    let adjustedBalance = currentBalance;

    if (type === 'defer') {
        // Capitalize interest during deferral
        adjustedBalance = capitalizeInterest(currentBalance, monthlyRate, affectedMonths);
        const newRemainingTerm = remainingTerm - affectedMonths;
        newPayment = annuity(adjustedBalance, monthlyRate, newRemainingTerm);
        
        // Cash flows: 0 for deferral months, then new payments
        const payments = new Array(affectedMonths).fill(0)
            .concat(new Array(newRemainingTerm).fill(newPayment));
        cashFlows = generateCashFlows(currentBalance, payments, remainingTerm);
        
    } else if (type === 'step-down') {
        const reducedPayment = originalPayment * reductionFactor;
        const balanceAfterReduced = getBalance(currentBalance, reducedPayment, monthlyRate, affectedMonths);
        const compensationPayment = annuity(balanceAfterReduced, monthlyRate, remainingTerm - affectedMonths);
        newPayment = compensationPayment;
        
        // Cash flows: reduced payments, then compensation payments
        const payments = new Array(affectedMonths).fill(reducedPayment)
            .concat(new Array(remainingTerm - affectedMonths).fill(compensationPayment));
        cashFlows = generateCashFlows(currentBalance, payments, remainingTerm);
        
    } else if (type === 'recalendar') {
        newTerm = remainingTerm + affectedMonths;
        newPayment = originalPayment;
        
        // Cash flows: 0 for deferral months, then original payments for extended term
        const payments = new Array(affectedMonths).fill(0)
            .concat(new Array(remainingTerm).fill(originalPayment));
        cashFlows = generateCashFlows(currentBalance, payments, newTerm);
    }

    // Calculate TIR for this scenario
    const annualTIR = calculateTIR(cashFlows) * 12; // Convert monthly to annual
    const tirMin = getTIRMin(market);
    const tirOK = annualTIR >= tirMin;

    const scenario: ProtectionScenario = {
        type: type as any,
        title,
        description,
        newMonthlyPayment: newPayment,
        newTerm: type === 'recalendar' ? remainingTerm + affectedMonths : remainingTerm,
        termChange: type === 'recalendar' ? affectedMonths : 0,
        details: [],
        // Advanced properties for mathematical analysis
        irr: annualTIR,
        tirOK,
        cashFlows,
        capitalizedInterest: type === 'defer' ? adjustedBalance - currentBalance : 0,
        principalBalance: adjustedBalance,
    };

    // Generate appropriate details based on scenario type
    if (type === 'defer') {
        scenario.details = [
            `Pagos de $0 por ${affectedMonths} meses`,
            `Interés capitalizado: ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(scenario.capitalizedInterest || 0)}`,
            `El pago mensual sube a ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(newPayment)} después.`,
            `TIR: ${(annualTIR * 100).toFixed(2)}% ${tirOK ? '✓' : '✗'}`
        ];
    } else if (type === 'step-down') {
        const reducedPayment = originalPayment * reductionFactor;
        scenario.details = [
            `Pagos de ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(reducedPayment)} por ${affectedMonths} meses`,
            `El pago sube a ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(newPayment)} después.`,
            `TIR: ${(annualTIR * 100).toFixed(2)}% ${tirOK ? '✓' : '✗'}`
        ];
    } else if (type === 'recalendar') {
        scenario.details = [
            `Pagos de $0 por ${affectedMonths} meses`,
            `El plazo se extiende en ${affectedMonths} meses.`,
            `TIR: ${(annualTIR * 100).toFixed(2)}% ${tirOK ? '✓' : '✗'}`
        ];
    }

    return scenario;
};
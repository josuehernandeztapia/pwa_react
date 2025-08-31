
import { BusinessFlow } from '../models/types';

export const ALL_FLOWS = 'Todos los Flujos';

export const BUSINESS_FLOWS: (BusinessFlow | 'Todos los Flujos')[] = [
    ALL_FLOWS,
    BusinessFlow.VentaPlazo,
    BusinessFlow.AhorroProgramado,
    BusinessFlow.CreditoColectivo,
    BusinessFlow.VentaDirecta,
];
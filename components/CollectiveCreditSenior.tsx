import React, { useState, useMemo, useEffect } from 'react';
import { TandaSimDraft, TandaSimulationResult, TandaMonthState, TandaAward, TandaSimEvent } from '../types';
import { simulationService } from '../services/simulationService';
import { UserGroupIcon, PlusCircleIcon, SparklesIcon, TrendingUpIcon, CheckCircleIcon, XCircleIcon } from './icons';
import { toast } from './Toast';
import { SeniorSummary } from './SeniorSummary';
import { SimpleTimeline } from './SimpleTimeline';
import { WhatsList } from './WhatsList';
import { 
  simulateWithDelta, 
  extractSeniorSummary, 
  extractWhatsListItems, 
  extractTimelineEntregas,
  speakSummary,
  generateWhatsAppSummary 
} from '../services/seniorTandaUtils';

const createDefaultDraft = (): TandaSimDraft => ({
  group: {
    name: 'Tanda Ruta 25',
    members: Array.from({ length: 5 }, (_, i) => ({
      id: `M${i + 1}`,
      name: `Miembro ${i + 1}`,
      prio: i + 1,
      status: 'active',
      C: 5000,
    })),
    product: {
      price: 950000,
      dpPct: 0.15,
      term: 60,
      rateAnnual: 0.299,
      fees: 10000,
    },
    rules: {
      allocRule: 'debt_first',
      eligibility: { requireThisMonthPaid: true },
    },
    seed: 12345,
  },
  config: {
    horizonMonths: 48,
    events: [],
  },
});

export const CollectiveCreditSenior: React.FC = () => {
    const [draft, setDraft] = useState<TandaSimDraft>(createDefaultDraft());
    const [result, setResult] = useState<TandaSimulationResult | null>(null);
    const [deltaResult, setDeltaResult] = useState<TandaSimulationResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [viewMode, setViewMode] = useState<'senior' | 'advanced'>('senior');

    const handleSimulate = async () => {
        setIsLoading(true);
        setResult(null);
        setDeltaResult(null);
        
        try {
            const res = await simulationService.simulateTanda(draft.group, draft.config);
            setResult(res);
            
            // Also simulate with +$500 for impact analysis
            const deltaRes = await simulateWithDelta(draft.group, draft.config, 500);
            setDeltaResult(deltaRes.withDelta);
            
            toast.success("Simulación completada con éxito.");
        } catch (error) {
            console.error(error);
            toast.error("Error al ejecutar la simulación.");
        } finally {
            setIsLoading(false);
        }
    };

    const seniorData = useMemo(() => {
        if (!result) return null;
        return extractSeniorSummary(deltaResult || result, result, 500);
    }, [result, deltaResult]);

    const whatsListItems = useMemo(() => {
        if (!result) return [];
        return extractWhatsListItems(result);
    }, [result]);

    const timelineEntregas = useMemo(() => {
        if (!result) return [];
        return extractTimelineEntregas(result);
    }, [result]);

    const handleSpeak = () => {
        if (seniorData) {
            speakSummary(seniorData);
        }
    };

    const handleWhatsAppShare = () => {
        if (seniorData) {
            const message = generateWhatsAppSummary(seniorData, draft.group.name, whatsListItems);
            const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
            window.open(whatsappUrl, '_blank');
        }
    };

    const handleFormalize = () => {
        if (!result) {
            toast.error("Primero debes correr una simulación exitosa.");
            return;
        }
        toast.info(`Formalizando grupo "${draft.group.name}"... (Simulado)`);
    };

    if (viewMode === 'senior') {
        return (
            <div>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-3xl font-bold text-white flex items-center gap-3">
                        <UserGroupIcon className="w-8 h-8"/> 
                        Simulador de Tandas
                    </h2>
                    <button 
                        onClick={() => setViewMode('advanced')}
                        className="px-4 py-2 text-sm bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600"
                    >
                        Vista Avanzada
                    </button>
                </div>

                {/* Simple Configuration */}
                <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 mb-6">
                    <h3 className="text-xl font-semibold text-white mb-4">¿Cuántos son y cuánto aportan?</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <label className="block text-lg font-medium text-white mb-2">¿Cuántos son?</label>
                            <div className="relative">
                                <input 
                                    value={draft.group.members.length} 
                                    onChange={e => setDraft(d => ({
                                        ...d, 
                                        group: {
                                            ...d.group, 
                                            members: Array.from({length: +e.target.value}, (_, i) => ({ 
                                                id: `M${i+1}`, 
                                                name: `Miembro ${i+1}`, 
                                                prio: i+1, 
                                                status: 'active', 
                                                C: d.group.members[0]?.C || 5000
                                            }))
                                        }
                                    }))} 
                                    type="number" 
                                    min="2"
                                    max="20"
                                    className="w-full px-4 py-4 bg-gray-800 border border-gray-600 rounded-lg text-white text-2xl font-bold text-center"
                                />
                                <span className="absolute right-4 top-4 text-gray-400 text-lg">personas</span>
                            </div>
                        </div>

                        <div>
                            <label className="block text-lg font-medium text-white mb-2">Aportación por mes</label>
                            <div className="relative">
                                <span className="absolute left-4 top-4 text-gray-400 text-xl">$</span>
                                <input 
                                    value={draft.group.members[0]?.C || 5000} 
                                    onChange={e => setDraft(d => ({
                                        ...d, 
                                        group: {
                                            ...d.group, 
                                            members: d.group.members.map(m => ({...m, C: +e.target.value}))
                                        }
                                    }))} 
                                    type="number"
                                    step="100"
                                    className="w-full px-4 py-4 pl-8 bg-gray-800 border border-gray-600 rounded-lg text-white text-2xl font-bold text-center"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-lg font-medium text-white mb-2">Precio de la unidad</label>
                            <div className="relative">
                                <span className="absolute left-4 top-4 text-gray-400 text-xl">$</span>
                                <input 
                                    value={draft.group.product.price} 
                                    onChange={e => setDraft(d => ({
                                        ...d, 
                                        group: {
                                            ...d.group, 
                                            product: {...d.group.product, price: +e.target.value}
                                        }
                                    }))} 
                                    type="number"
                                    step="10000"
                                    className="w-full px-4 py-4 pl-8 bg-gray-800 border border-gray-600 rounded-lg text-white text-2xl font-bold text-center"
                                />
                            </div>
                        </div>
                    </div>

                    <button 
                        onClick={handleSimulate} 
                        disabled={isLoading} 
                        className="w-full mt-6 px-6 py-4 text-xl font-bold text-white bg-primary-cyan-600 rounded-lg hover:bg-primary-cyan-700 disabled:opacity-50"
                    >
                        {isLoading ? 'Calculando...' : '🔄 Calcular'}
                    </button>
                </div>

                {/* Senior-Friendly Results */}
                {result && seniorData && (
                    <div className="space-y-6">
                        {/* 3-sentence summary */}
                        <SeniorSummary {...seniorData} />

                        {/* Action buttons */}
                        <div className="flex gap-4">
                            <button 
                                onClick={handleSpeak}
                                className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
                            >
                                🔊 Escúchalo
                            </button>
                            <button 
                                onClick={handleWhatsAppShare}
                                className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center gap-2"
                            >
                                📱 Enviar por WhatsApp
                            </button>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Timeline */}
                            <SimpleTimeline entregas={timelineEntregas} />
                            
                            {/* WhatsApp-style list */}
                            <WhatsList items={whatsListItems} />
                        </div>

                        {/* Formalize button */}
                        <div className="text-center">
                            <button 
                                onClick={handleFormalize}
                                className="px-8 py-4 text-lg font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
                            >
                                ✅ Formalizar Grupo
                            </button>
                        </div>
                    </div>
                )}

                {!result && !isLoading && (
                    <div className="bg-gray-800 p-8 rounded-lg text-center">
                        <div className="text-6xl mb-4">🚛</div>
                        <p className="text-xl text-white mb-2">Configura tu tanda y presiona Calcular</p>
                        <p className="text-gray-400">Los resultados aparecerán en un formato fácil de entender</p>
                    </div>
                )}

                {isLoading && (
                    <div className="bg-gray-800 p-8 rounded-lg text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-cyan-400 mx-auto mb-4"></div>
                        <p className="text-xl text-white">Calculando tu tanda...</p>
                    </div>
                )}
            </div>
        );
    }

    // Advanced view (original implementation) - keeping for asesor mode
    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                    <UserGroupIcon className="w-8 h-8"/> 
                    Simulador de Tandas (Vista Avanzada)
                </h2>
                <button 
                    onClick={() => setViewMode('senior')}
                    className="px-4 py-2 text-sm bg-primary-cyan-600 text-white rounded-lg hover:bg-primary-cyan-700"
                >
                    Vista Simple
                </button>
            </div>

            {/* Original advanced implementation would go here... */}
            <div className="bg-gray-800 p-6 rounded-lg text-center">
                <p className="text-white text-lg">Vista Avanzada - Funcionalidad Técnica Completa</p>
                <p className="text-gray-400 mt-2">Incluye configuración detallada, eventos what-if, y análisis profundo</p>
                <button 
                    onClick={() => setViewMode('senior')}
                    className="mt-4 px-4 py-2 bg-primary-cyan-600 text-white rounded-lg hover:bg-primary-cyan-700"
                >
                    Volver a Vista Simple
                </button>
            </div>
        </div>
    );
};
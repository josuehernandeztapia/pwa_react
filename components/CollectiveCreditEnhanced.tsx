import React, { useState, useMemo } from 'react';
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

const KpiCard: React.FC<{ title: string; value: string; icon: React.ReactNode }> = ({ title, value, icon }) => (
    <div className="bg-gray-800 p-4 rounded-lg flex items-center">
        <div className="p-3 rounded-full bg-primary-cyan-500/10 mr-4">{icon}</div>
        <div>
            <p className="text-sm text-gray-400">{title}</p>
            <p className="text-2xl font-bold text-white">{value}</p>
        </div>
    </div>
);

const MonthTimelineItem: React.FC<{ month: TandaMonthState }> = ({ month }) => (
    <div className="p-3 rounded-lg bg-gray-800/60 border border-gray-700/50">
        <div className="flex justify-between items-center">
            <h5 className="font-bold text-white">Mes {month.t}</h5>
            {month.riskBadge === 'debtDeficit' && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-500/20 text-red-300">Déficit de Deuda</span>}
        </div>
        <div className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">Aportaciones:</span> <span className="font-mono text-emerald-300">{`+${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(month.inflow)}`}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Deuda del Mes:</span> <span className="font-mono text-amber-300">{`-${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(month.debtDue)}`}</span></div>
            <div className="flex justify-between pt-1 border-t border-gray-700"><span className="text-gray-200 font-semibold">Ahorro Neto:</span> <span className="font-mono font-bold text-white">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(month.savings)}</span></div>
        </div>
        {month.awards.length > 0 && (
            <div className="mt-3 pt-2 border-t border-dashed border-gray-600">
                {month.awards.map(award => (
                    <div key={award.memberId} className="flex items-center gap-2 text-sm text-emerald-300">
                        <SparklesIcon className="w-4 h-4" />
                        <span>¡Unidad entregada a {award.name}!</span>
                    </div>
                ))}
            </div>
        )}
    </div>
);

export const CollectiveCreditEnhanced: React.FC = () => {
    const [draft, setDraft] = useState<TandaSimDraft>(createDefaultDraft());
    const [result, setResult] = useState<TandaSimulationResult | null>(null);
    const [deltaResult, setDeltaResult] = useState<TandaSimulationResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [viewMode, setViewMode] = useState<'senior' | 'advanced'>('senior');
    const [newEvent, setNewEvent] = useState<{t: string, type: 'miss' | 'extra', memberId: string, amount: string}>({ t: '1', type: 'extra', memberId: 'M1', amount: '5000' });

    const handleSimulate = async () => {
        setIsLoading(true);
        setResult(null);
        setDeltaResult(null);
        
        try {
            const res = await simulationService.simulateTanda(draft.group, draft.config);
            setResult(res);
            
            // Also simulate with +$500 for impact analysis (only in senior mode)
            if (viewMode === 'senior') {
                const deltaRes = await simulateWithDelta(draft.group, draft.config, 500);
                setDeltaResult(deltaRes.withDelta);
            }
            
            toast.success("Simulación completada con éxito.");
        } catch (error) {
            console.error(error);
            toast.error("Error al ejecutar la simulación.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddEvent = () => {
        const event: TandaSimEvent = {
            t: parseInt(newEvent.t, 10),
            type: newEvent.type,
            data: {
                memberId: newEvent.memberId,
                amount: parseFloat(newEvent.amount)
            },
            id: `evt-${Date.now()}`
        };
        if (isNaN(event.t) || isNaN(event.data.amount) || !event.data.memberId) {
            toast.error("Por favor, introduce valores válidos para el evento.");
            return;
        }
        setDraft(prev => ({
            ...prev,
            config: {
                ...prev.config,
                events: [...prev.config.events, event]
            }
        }));
    };
    
    const handleRemoveEvent = (id: string) => {
        setDraft(prev => ({
            ...prev,
            config: { ...prev.config, events: prev.config.events.filter(e => e.id !== id) }
        }));
    }

    const handleFormalize = () => {
        if (!result) {
            toast.error("Primero debes correr una simulación exitosa.");
            return;
        }
        toast.info(`Formalizando grupo "${draft.group.name}"... (Simulado)`);
    };

    const seniorData = useMemo(() => {
        if (!result || viewMode !== 'senior') return null;
        return extractSeniorSummary(deltaResult || result, result, 500);
    }, [result, deltaResult, viewMode]);

    const whatsListItems = useMemo(() => {
        if (!result || viewMode !== 'senior') return [];
        return extractWhatsListItems(result);
    }, [result, viewMode]);

    const timelineEntregas = useMemo(() => {
        if (!result || viewMode !== 'senior') return [];
        return extractTimelineEntregas(result);
    }, [result, viewMode]);

    const kpis = useMemo(() => {
        if (!result) return null;
        return [
            { title: 'Unidades Entregadas', value: `${result.kpis.deliveredCount} / ${draft.group.members.length}`, icon: <CheckCircleIcon className="w-6 h-6 text-primary-cyan-400" /> },
            { title: 'Primera Entrega', value: `Mes ${result.firstAwardT || 'N/A'}`, icon: <SparklesIcon className="w-6 h-6 text-primary-cyan-400" /> },
            { title: 'Última Entrega', value: `Mes ${result.lastAwardT || 'N/A'}`, icon: <UserGroupIcon className="w-6 h-6 text-primary-cyan-400" /> },
            { title: 'Tiempo Promedio', value: `${result.kpis.avgTimeToAward.toFixed(1)} meses`, icon: <TrendingUpIcon className="w-6 h-6 text-primary-cyan-400" /> },
        ];
    }, [result, draft.group.members.length]);

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

    // Senior-friendly view
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
                        <SeniorSummary {...seniorData} />

                        <div className="flex gap-4">
                            <button 
                                onClick={handleSpeak}
                                className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 text-lg"
                            >
                                🔊 Escúchalo
                            </button>
                            <button 
                                onClick={handleWhatsAppShare}
                                className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center gap-2 text-lg"
                            >
                                📱 Enviar por WhatsApp
                            </button>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <SimpleTimeline entregas={timelineEntregas} />
                            <WhatsList items={whatsListItems} />
                        </div>

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

    // Advanced view (original implementation with all functionality preserved)
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

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                {/* Configuration Panel - Advanced */}
                <div className="lg:col-span-2 bg-gray-900 p-6 rounded-xl border border-gray-800 self-start space-y-6">
                    <h3 className="text-xl font-semibold text-white">1. Configuración del Escenario</h3>
                    
                    {/* Group Setup */}
                    <div>
                        <label className="text-sm font-medium text-gray-300">Parámetros del Producto</label>
                        <div className="grid grid-cols-2 gap-3 mt-2">
                             <input value={draft.group.product.price} onChange={e => setDraft(d => ({...d, group: {...d.group, product: {...d.group.product, price: +e.target.value}} }))} type="number" placeholder="Precio Unidad" className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-white text-sm" />
                             <input value={draft.group.product.dpPct * 100} onChange={e => setDraft(d => ({...d, group: {...d.group, product: {...d.group.product, dpPct: +e.target.value / 100}} }))} type="number" placeholder="% Enganche" className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-white text-sm" />
                             <input value={draft.group.members[0]?.C || 5000} onChange={e => setDraft(d => ({...d, group: {...d.group, members: d.group.members.map(m => ({...m, C: +e.target.value}))} }))} type="number" placeholder="Aporte Mensual" className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-white text-sm" />
                             <input value={draft.group.members.length} onChange={e => setDraft(d => ({...d, group: {...d.group, members: Array.from({length: +e.target.value}, (_, i) => ({ id: `M${i+1}`, name: `Miembro ${i+1}`, prio: i+1, status: 'active', C: d.group.members[0]?.C || 5000}))}}))} type="number" placeholder="# Miembros" className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-white text-sm" />
                        </div>
                    </div>
                    
                    {/* What-if Builder */}
                    <div className="pt-4 border-t border-gray-700/50">
                        <label className="text-sm font-medium text-gray-300">Añadir Evento "What-If"</label>
                        <div className="mt-2 space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                                <input value={newEvent.t} onChange={e => setNewEvent(v => ({...v, t: e.target.value}))} type="number" placeholder="Mes" className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-white text-sm" />
                                <select value={newEvent.type} onChange={e => setNewEvent(v => ({...v, type: e.target.value as 'miss' | 'extra'}))} className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-white text-sm">
                                    <option value="extra">Aporte Extra</option>
                                    <option value="miss">Atraso</option>
                                </select>
                            </div>
                             <div className="grid grid-cols-2 gap-2">
                                <select value={newEvent.memberId} onChange={e => setNewEvent(v => ({...v, memberId: e.target.value}))} className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-white text-sm">
                                    {draft.group.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </select>
                                 <input value={newEvent.amount} onChange={e => setNewEvent(v => ({...v, amount: e.target.value}))} type="number" placeholder="Monto" className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-white text-sm" />
                            </div>
                            <button onClick={handleAddEvent} className="w-full text-xs text-primary-cyan-400 hover:text-primary-cyan-300 p-2 border-2 border-dashed border-gray-600 rounded-md mt-2">
                                <PlusCircleIcon className="w-4 h-4 inline mr-1"/> Añadir Evento a la Simulación
                            </button>
                        </div>
                         <div className="mt-3 space-y-1 max-h-32 overflow-y-auto pr-1">
                            {draft.config.events.map(e => (
                                <div key={e.id} className="flex justify-between items-center text-xs p-1.5 bg-gray-800 rounded">
                                    <span className="text-gray-300">Mes {e.t}: {e.data.memberId} {e.type === 'extra' ? 'aportó' : 'se atrasó con'} ${e.data.amount}</span>
                                    <button onClick={() => handleRemoveEvent(e.id)}><XCircleIcon className="w-4 h-4 text-red-500 hover:text-red-400"/></button>
                                </div>
                            ))}
                        </div>
                    </div>
                    
                    {/* Actions */}
                     <div className="pt-6 border-t border-gray-700/50 flex flex-col gap-3">
                        <button onClick={handleSimulate} disabled={isLoading} className="w-full flex items-center justify-center px-4 py-3 text-sm font-semibold text-white bg-primary-cyan-600 rounded-lg hover:bg-primary-cyan-700 disabled:opacity-50">
                            {isLoading ? 'Calculando...' : 'Simular Escenario'}
                        </button>
                        <button onClick={handleFormalize} disabled={!result} className="w-full px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                            Formalizar Grupo
                        </button>
                    </div>
                </div>

                {/* Advanced Results Panel */}
                <div className="lg:col-span-3 bg-gray-900 p-6 rounded-xl border border-gray-800">
                     <h3 className="text-xl font-semibold text-white mb-4">2. Resultados de la Simulación</h3>
                     {isLoading && (
                        <div className="flex items-center justify-center h-96">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-cyan-400"></div>
                        </div>
                     )}
                     {!isLoading && result && kpis && (
                        <div>
                             <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                                {kpis.map(kpi => <KpiCard key={kpi.title} {...kpi} />)}
                            </div>
                            <h4 className="font-semibold text-white mb-3">Línea de Tiempo Mensual</h4>
                            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                               {result.months.map(month => <MonthTimelineItem key={month.t} month={month} />)}
                            </div>
                        </div>
                     )}
                     {!isLoading && !result && (
                        <div className="flex flex-col items-center justify-center h-96 text-center text-gray-500">
                            <TrendingUpIcon className="w-16 h-16 mb-4"/>
                            <p>Los resultados de la simulación aparecerán aquí.</p>
                            <p className="text-sm">Configura tu escenario y presiona "Simular".</p>
                        </div>
                     )}
                </div>
            </div>
            <style>{`.custom-scrollbar::-webkit-scrollbar { width: 4px; } .custom-scrollbar::-webkit-scrollbar-track { background: #1f2937; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #0891b2; border-radius: 4px; }`}</style>
        </div>
    );
};
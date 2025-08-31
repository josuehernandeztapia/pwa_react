import React from 'react';

interface WhatsListItem {
  tipo: 'entrega' | 'ahorro';
  n: number;
  mes?: number;
  persona?: string;
  acum?: number;
  faltan?: number;
}

interface WhatsListProps {
  items: WhatsListItem[];
}

export const WhatsList: React.FC<WhatsListProps> = ({ items }) => {
  return (
    <div className="bg-gray-800 p-4 rounded-lg">
      <h4 className="text-lg font-semibold text-white mb-4">Próximos Eventos</h4>
      
      <ul style={{ listStyle: 'none', padding: 0 }} className="space-y-3">
        {items.map((item, idx) => (
          <li 
            key={idx} 
            style={{
              display: 'flex',
              alignItems: 'center', 
              gap: 12, 
              padding: '12px 16px', 
              borderBottom: idx < items.length - 1 ? '1px solid #374151' : 'none'
            }}
            className="hover:bg-gray-700/30 rounded-lg transition-colors"
          >
            <div style={{ fontSize: 22 }}>
              {item.tipo === 'entrega' ? '✅' : '💙'}
            </div>
            
            <div className="flex-1">
              <div style={{ fontSize: 16, fontWeight: 600 }} className="text-white">
                {item.tipo === 'entrega' 
                  ? `Entrega Unidad ${item.n}` 
                  : `Ahorro para Enganche ${item.n}`}
              </div>
              
              <div style={{ fontSize: 14 }} className="text-gray-400 mt-1">
                {item.tipo === 'entrega'
                  ? `Mes ${item.mes} · ${item.persona} recibe su unidad`
                  : `Acumulan ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.acum || 0)} · Faltan ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.faltan || 0)}`}
              </div>
            </div>

            {/* Status indicator */}
            {item.tipo === 'entrega' && (
              <div className="text-emerald-400 font-bold text-sm">
                ¡LISTO!
              </div>
            )}
          </li>
        ))}
      </ul>

      {items.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <div className="text-4xl mb-2">📊</div>
          <p>Ejecuta la simulación para ver los eventos</p>
        </div>
      )}
    </div>
  );
};
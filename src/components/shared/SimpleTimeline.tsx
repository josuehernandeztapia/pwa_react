import React from 'react';

interface TimelineEntrega {
  mes: number;
  miembro: string;
  unitNumber: number;
}

interface SimpleTimelineProps {
  entregas: TimelineEntrega[];
  maxMonths?: number;
}

export const SimpleTimeline: React.FC<SimpleTimelineProps> = ({ entregas, maxMonths = 36 }) => {
  return (
    <div className="bg-gray-800 p-4 rounded-lg">
      <h4 className="text-lg font-semibold text-white mb-4">Cronograma de Entregas</h4>
      
      {/* Timeline bar */}
      <div style={{ marginTop: 12 }}>
        <div 
          style={{
            height: 12, 
            background: '#1f2937', 
            borderRadius: 6, 
            position: 'relative',
            border: '2px solid #374151'
          }}
        >
          {entregas.map((entrega, i) => {
            const leftPercentage = (entrega.mes / maxMonths) * 100;
            return (
              <div 
                key={i}
                title={`Entrega #${entrega.unitNumber} · mes ${entrega.mes} · ${entrega.miembro}`}
                style={{
                  position: 'absolute', 
                  left: `${Math.min(leftPercentage, 95)}%`, 
                  top: -8,
                  transform: 'translateX(-50%)'
                }}
              >
                <span style={{ fontSize: 24, color: '#22c55e' }}>✔</span>
              </div>
            );
          })}
        </div>
        
        {/* Month labels */}
        <div 
          style={{
            display: 'flex', 
            justifyContent: 'space-between', 
            color: '#9ca3af', 
            fontSize: 12,
            marginTop: 8
          }}
        >
          <span>Mes 1</span>
          <span>Mes 12</span>
          <span>Mes 24</span>
          <span>Mes 36</span>
        </div>
      </div>

      {/* Delivery details */}
      <div className="mt-4 space-y-2">
        {entregas.slice(0, 3).map((entrega, i) => (
          <div key={i} className="flex items-center gap-3 text-sm">
            <span className="text-2xl">✔</span>
            <div>
              <span className="text-white font-medium">Unidad #{entrega.unitNumber}</span>
              <span className="text-gray-400 ml-2">→ mes {entrega.mes} → {entrega.miembro}</span>
            </div>
          </div>
        ))}
        {entregas.length > 3 && (
          <div className="text-gray-400 text-sm ml-8">
            ... y {entregas.length - 3} entregas más
          </div>
        )}
      </div>
    </div>
  );
};
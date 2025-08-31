import React from 'react';

interface SeniorSummaryProps {
  ahorroHoy: number;
  siguienteMes: number;
  extraSugerido: number;
  avanceMeses: number;
}

export const SeniorSummary: React.FC<SeniorSummaryProps> = ({ 
  ahorroHoy, 
  siguienteMes, 
  extraSugerido, 
  avanceMeses 
}) => {
  return (
    <div className="bg-gray-800 p-6 rounded-lg border-l-4 border-primary-cyan-500">
      <div style={{ fontSize: 22, lineHeight: 1.4 }} className="space-y-2 text-white">
        <div>
          Hoy tienen <b className="text-emerald-400">${ahorroHoy.toLocaleString()}</b> ahorrado.
        </div>
        <div>
          Siguiente <b className="text-primary-cyan-400">entrega</b>: mes <b>{siguienteMes}</b>.
        </div>
        <div>
          Si ponen <b className="text-amber-400">${extraSugerido.toLocaleString()}</b> más este mes, 
          <b className="text-emerald-400"> adelantan {avanceMeses} mes</b>.
        </div>
      </div>
    </div>
  );
};
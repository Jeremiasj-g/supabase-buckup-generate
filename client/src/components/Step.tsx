import { Check, LoaderCircle } from 'lucide-react';

type Stage = 'pending' | 'running' | 'done';

export function Step({ num, title, subtitle, stage }: {
  num: number;
  title: string;
  subtitle: string;
  stage: Stage;
}) {
  return (
    <div className={'step step-' + stage}>
      <div className={'mark ' + stage}>
        <span className="mark-content" key={stage}>
          {stage === 'done'
            ? <Check size={14} aria-label="Completado" />
            : stage === 'running'
              ? <LoaderCircle size={15} className="spin" aria-label="Procesando" />
              : String(num).padStart(2, '0')}
        </span>
      </div>
      <div>
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
    </div>
  );
}

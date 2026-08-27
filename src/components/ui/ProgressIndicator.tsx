import { Check } from 'lucide-react';
import { classNames } from '@/lib/utils';

interface ProgressIndicatorProps {
  steps: string[];
  currentIndex: number;
}

export default function ProgressIndicator({ steps, currentIndex }: ProgressIndicatorProps) {
  return (
    <div className="flex items-center gap-x-2 mb-8">
      {steps.map((label, i) => {
        const isComplete = i < currentIndex;
        const isActive = i === currentIndex;
        const isInactive = i > currentIndex;

        return (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={classNames(
                  'flex items-center justify-center w-8 h-8 rounded-full text-xs font-semibold transition-colors duration-300',
                  isActive && 'bg-jungo-green-500 text-white',
                  isComplete && 'bg-jungo-green-200 text-jungo-green-700',
                  isInactive && 'border-2 border-gray-300 text-gray-400 bg-white'
                )}
              >
                {isComplete ? (
                  <Check className="w-4 h-4" />
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={classNames(
                  'text-xs whitespace-nowrap transition-colors duration-300',
                  isActive ? 'font-semibold text-jungo-green-700' : 'font-normal text-gray-400'
                )}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={classNames(
                  'h-0.5 flex-1 mx-1 rounded-full transition-colors duration-300 mb-5',
                  i < currentIndex ? 'bg-jungo-green-300' : 'bg-gray-200'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

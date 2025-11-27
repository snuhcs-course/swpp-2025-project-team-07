import { TooltipRenderProps } from 'react-joyride';
import { Button } from './ui/button';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { Card } from './ui/card';

export function OnboardingTooltip({
  index,
  step,
  backProps,
  primaryProps,
  tooltipProps,
  isLastStep,
  skipProps,
}: TooltipRenderProps) {
  return (
    <Card
      {...tooltipProps}
      className="bg-[#27272a] text-white p-5 rounded-xl max-w-md shadow-2xl border border-zinc-700 flex flex-col gap-4 relative"
    >
      <div>
        {/* Close Button */}
        <button
          {...skipProps}
          className="absolute top-2 right-2 text-zinc-400 hover:text-white transition-colors p-1 rounded-md hover:bg-zinc-700/50"
          aria-label="Close tour"
        >
          <X className="w-4 h-4" />
        </button>
        {step.title && (
          <h4 className="font-semibold text-lg pr-8">{step.title}</h4>
        )}
      </div>

      <div className="text-zinc-100 leading-relaxed">
        {step.content}
      </div>
      
      <div className="flex items-center justify-between pt-2 mt-2 border-t border-zinc-700/50">
        {/* Back Button */}
        <Button
          {...backProps}
          variant="ghost"
          size="sm"
          className={`text-zinc-300 hover:text-white hover:bg-zinc-700/50 ${index === 0 ? 'invisible' : ''}`}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        {/* Next/Finish Button */}
        <Button
          {...primaryProps}
          variant="ghost"
          size="sm"
          className={`text-zinc-300 hover:text-white hover:bg-zinc-700/50`}
        >
          {isLastStep ? 'Finish' : 'Next'}
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </Card>
  );
}

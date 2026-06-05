import React, { useState } from "react";
import { HelpCircle, Check, X, Award, RotateCcw } from "lucide-react";
import { Block } from "../../Tagger";

export default function QuizCard({ block }: { block: Block }) {
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const question = "Which of the following is a primary benefit of the 'Living Manuscript' approach?";
  const options = [
    "It forces writers to use specialized syntax.",
    "It naturally couples drafting with organizational structure without managing separate files.",
    "It automatically publishes your draft to WordPress.",
    "It prevents anyone else from reading your work."
  ];
  const correctAnswer = 1;

  const handleSubmit = () => {
    if (selectedAnswer !== null) setIsSubmitted(true);
  };

  const handleReset = () => {
    setSelectedAnswer(null);
    setIsSubmitted(false);
  };

  const isCorrect = selectedAnswer === correctAnswer;

  return (
    <div className="my-8 rounded-2xl border-2 border-sky-200 bg-white overflow-hidden shadow-sm">
      <div className="bg-gradient-to-r from-sky-500 to-blue-600 p-6 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-20 transform translate-x-4 -translate-y-4">
          <HelpCircle size={120} />
        </div>
        <div className="relative z-10">
          <div className="text-sky-100 text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-2">
            <Award size={14} /> Knowledge Check
          </div>
          <h3 className="text-2xl font-bold font-serif leading-snug max-w-2xl text-white">
            {question}
          </h3>
        </div>
      </div>

      <div className="p-6 space-y-3 bg-sky-50/30">
        {options.map((opt, idx) => {
          const isSelected = selectedAnswer === idx;
          let stateClass = "border-gray-200 hover:border-sky-300 hover:bg-sky-50 text-gray-700 cursor-pointer";
          let icon = null;

          if (isSubmitted) {
            if (idx === correctAnswer) {
              stateClass = "border-emerald-500 bg-emerald-50 text-emerald-900 cursor-default ring-2 ring-emerald-200";
              icon = <Check size={20} className="text-emerald-600" />;
            } else if (isSelected) {
              stateClass = "border-rose-300 bg-rose-50 text-rose-900 cursor-default";
              icon = <X size={20} className="text-rose-500" />;
            } else {
              stateClass = "border-gray-200 bg-gray-50 text-gray-400 cursor-default opacity-50";
            }
          } else if (isSelected) {
            stateClass = "border-sky-500 bg-sky-50 text-sky-900 ring-2 ring-sky-200";
          }

          return (
            <div 
              key={idx}
              onClick={() => !isSubmitted && setSelectedAnswer(idx)}
              className={`p-4 rounded-xl border-2 transition-all flex items-start gap-4 ${stateClass}`}
            >
              <div className={`mt-0.5 w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors ${
                isSelected && !isSubmitted ? 'border-sky-500 bg-sky-500' : 
                isSubmitted && idx === correctAnswer ? 'border-emerald-500 bg-emerald-500' :
                isSubmitted && isSelected ? 'border-rose-500 bg-rose-500' :
                'border-gray-300'
              }`}>
                {isSelected && !isSubmitted && <div className="w-2 h-2 rounded-full bg-white" />}
                {isSubmitted && idx === correctAnswer && <Check size={12} className="text-white" />}
                {isSubmitted && isSelected && idx !== correctAnswer && <X size={12} className="text-white" />}
              </div>
              <div className="flex-1 font-medium text-sm leading-relaxed">{opt}</div>
              {icon && <div className="shrink-0">{icon}</div>}
            </div>
          );
        })}
      </div>

      <div className="bg-white border-t border-gray-100 p-5 flex items-center justify-between">
        {isSubmitted ? (
          <div className="flex items-center gap-4 w-full">
            <div className={`flex-1 text-sm font-bold ${isCorrect ? 'text-emerald-600' : 'text-rose-600'}`}>
              {isCorrect ? "Correct! Excellent understanding of the core architecture." : "Not quite. Remember that the manuscript naturally provides structure."}
            </div>
            <button 
              onClick={handleReset}
              className="shrink-0 text-sm font-bold text-gray-500 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-xl flex items-center gap-2 transition-colors"
            >
              <RotateCcw size={16} /> Try Again
            </button>
          </div>
        ) : (
          <div className="w-full flex justify-end">
            <button 
              onClick={handleSubmit}
              disabled={selectedAnswer === null}
              className={`text-sm font-bold px-8 py-3 rounded-xl transition-all shadow-sm ${
                selectedAnswer !== null 
                  ? 'bg-sky-600 hover:bg-sky-700 text-white' 
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              Check Answer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

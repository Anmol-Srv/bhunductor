import React, { useState, useEffect, useRef, useCallback } from 'react';

function AskUserQuestionBlock({ toolInput, status, result, sessionId, onSubmit, onCancel, hasPermission }) {
  const questions = toolInput?.questions || [];
  const isAlreadyAnswered = status === 'complete' && !!result;

  const totalSteps = questions.length + 1; // +1 for submit step
  const [activeStep, setActiveStep] = useState(0);
  const [focused, setFocused] = useState(0);
  const [answers, setAnswers] = useState({}); // { header: label }
  const [submitted, setSubmitted] = useState(isAlreadyAnswered);
  const [cancelled, setCancelled] = useState(false);
  const containerRef = useRef(null);

  // Parse existing answers if already complete
  useEffect(() => {
    if (!isAlreadyAnswered || !result) return;
    try {
      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      if (parsed?.answers) {
        setAnswers(parsed.answers);
        setSubmitted(true);
        setActiveStep(totalSteps - 1);
      }
      if (Array.isArray(parsed)) {
        const textBlock = parsed.find(b => b.type === 'text');
        if (textBlock?.text) {
          try {
            const inner = JSON.parse(textBlock.text);
            if (inner?.answers) {
              setAnswers(inner.answers);
              setSubmitted(true);
              setActiveStep(totalSteps - 1);
            }
          } catch {}
        }
      }
    } catch {}
  }, [isAlreadyAnswered, result]);

  // Focus container on mount so keyboard works immediately
  useEffect(() => {
    if (!submitted && !cancelled) containerRef.current?.focus();
  }, [submitted, cancelled]);

  // Reset focused option when switching questions
  useEffect(() => {
    if (activeStep < questions.length) {
      const q = questions[activeStep];
      const existingAnswer = answers[q.header];
      if (existingAnswer) {
        const idx = q.options.findIndex(o => o.label === existingAnswer);
        setFocused(idx >= 0 ? idx : 0);
      } else {
        setFocused(0);
      }
    } else {
      setFocused(0);
    }
  }, [activeStep]);

  const done = submitted || cancelled;
  const isSubmitStep = activeStep >= questions.length;
  const currentQuestion = !isSubmitStep ? questions[activeStep] : null;
  const currentOptions = currentQuestion?.options || [];

  const doSubmit = useCallback(() => {
    setSubmitted(true);
    if (onSubmit) onSubmit();
  }, [onSubmit]);

  const doCancel = useCallback(() => {
    setCancelled(true);
    if (onCancel) onCancel();
  }, [onCancel]);

  const handleKeyDown = useCallback((e) => {
    if (done) return;

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const max = isSubmitStep ? 2 : currentOptions.length;
      setFocused(f => (f - 1 + max) % max);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const max = isSubmitStep ? 2 : currentOptions.length;
      setFocused(f => (f + 1) % max);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (activeStep > 0) setActiveStep(s => s - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (activeStep < totalSteps - 1) setActiveStep(s => s + 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (isSubmitStep) {
        if (focused === 0) doSubmit();
        if (focused === 1) doCancel();
      } else {
        const opt = currentOptions[focused];
        if (opt) {
          const next = { ...answers, [currentQuestion.header]: opt.label };
          setAnswers(next);
          if (activeStep < totalSteps - 1) {
            setActiveStep(s => s + 1);
          }
        }
      }
    }
  }, [done, isSubmitStep, currentOptions, focused, activeStep, totalSteps, answers, questions, doSubmit, doCancel]);

  if (questions.length === 0) return null;

  const allAnswered = questions.every(q => answers[q.header]);

  return (
    <div
      className="ask-block"
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Step indicators */}
      <div className="ask-steps">
        {questions.map((q, i) => (
          <button
            key={i}
            className={`ask-step${i === activeStep ? ' active' : ''}${answers[q.header] ? ' done' : ''}`}
            onClick={() => { if (!done) setActiveStep(i); }}
          >
            {q.header}
          </button>
        ))}
        <button
          className={`ask-step${isSubmitStep ? ' active' : ''}${submitted ? ' done' : ''}`}
          onClick={() => { if (!done && allAnswered) setActiveStep(questions.length); }}
        >
          Submit
        </button>
      </div>

      {/* Current question */}
      {!isSubmitStep && currentQuestion && (
        <div className="ask-body">
          <div className="ask-question">{currentQuestion.question}</div>
          <div className="ask-options">
            {currentOptions.map((opt, i) => {
              const isSelected = answers[currentQuestion.header] === opt.label;
              const isFocused = focused === i && !done;
              return (
                <div
                  key={i}
                  className={`ask-opt${isFocused ? ' focused' : ''}${isSelected ? ' selected' : ''}`}
                  onClick={() => {
                    if (done) return;
                    setFocused(i);
                    const next = { ...answers, [currentQuestion.header]: opt.label };
                    setAnswers(next);
                    if (activeStep < totalSteps - 1) {
                      setTimeout(() => setActiveStep(s => s + 1), 120);
                    }
                  }}
                >
                  <span className="ask-marker">{isFocused || isSelected ? '>' : ' '}</span>
                  <span className="ask-label">{opt.label}</span>
                  <span className="ask-desc">{opt.description}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Submit / Cancel step */}
      {isSubmitStep && (
        <div className="ask-body">
          <div className="ask-question">Submit answers?</div>
          {!done ? (
            <div className="ask-options">
              <div
                className={`ask-opt${focused === 0 ? ' focused' : ''}`}
                onClick={doSubmit}
              >
                <span className="ask-marker">{focused === 0 ? '>' : ' '}</span>
                <span className="ask-label">Yes</span>
                <span className="ask-desc">Send answers to Claude</span>
              </div>
              <div
                className={`ask-opt${focused === 1 ? ' focused' : ''}`}
                onClick={doCancel}
              >
                <span className="ask-marker">{focused === 1 ? '>' : ' '}</span>
                <span className="ask-label">No</span>
                <span className="ask-desc">Cancel and deny</span>
              </div>
            </div>
          ) : (
            <div className="ask-submitted">
              {submitted ? 'Answers submitted.' : 'Cancelled.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AskUserQuestionBlock;

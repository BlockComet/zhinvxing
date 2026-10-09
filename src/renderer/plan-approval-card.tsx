import { ArrowRight, X } from "./icons.js";
import { useState } from "react";
import { InlineAnswer } from "./inline-answer.js";

interface PlanApprovalCardProps {
  disabled?: boolean;
  onApprove: () => Promise<boolean>;
  onRefine: (feedback: string) => Promise<boolean>;
  onCancel: () => Promise<boolean>;
}

export function PlanApprovalCard({ disabled, onApprove, onRefine, onCancel }: PlanApprovalCardProps) {
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function run(action: () => Promise<boolean>) {
    if (disabled || submitting) return;
    setSubmitting(true);
    try {
      await action();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="plan-approval-card" aria-label="确认计划">
      <header>
        <strong>执行此计划？</strong>
        <button type="button" disabled={disabled || submitting} onClick={() => void run(onCancel)} aria-label="取消计划"><X size={15} /></button>
      </header>

      <button className="plan-approval-approve" type="button" disabled={disabled || submitting} onClick={() => void run(onApprove)}>
        <span>1</span>
        <strong>是，执行此计划</strong>
        <ArrowRight size={15} />
      </button>

      {editing ? (
        <InlineAnswer
          editing
          value={feedback}
          disabled={disabled || submitting}
          label="不，告诉 OhMyGame 如何调整"
          placeholder="告诉 OhMyGame 如何调整"
          onChange={setFeedback}
          onSubmit={() => void run(() => onRefine(feedback.trim()))}
          onCancel={() => { setEditing(false); setFeedback(""); }}
        />
      ) : (
        <div className="plan-approval-footer">
          <InlineAnswer
            editing={false}
            disabled={disabled || submitting}
            label="不，告诉 OhMyGame 如何调整"
            onEdit={() => setEditing(true)}
          />
          <button className="plan-approval-skip" type="button" disabled={disabled || submitting} onClick={() => void run(onCancel)}>跳过</button>
        </div>
      )}
    </section>
  );
}

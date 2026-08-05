ALTER TABLE "brain_governance_transition"
ADD COLUMN "evidenceReceiptId" INTEGER,
ADD COLUMN "evidenceSnapshot" JSONB NOT NULL DEFAULT '{}';

CREATE INDEX "brain_governance_transition_evidenceReceiptId_idx"
ON "brain_governance_transition"("evidenceReceiptId");

ALTER TABLE "brain_governance_transition"
ADD CONSTRAINT "brain_governance_transition_evidenceReceiptId_fkey"
FOREIGN KEY ("evidenceReceiptId") REFERENCES "brain_gate_receipt"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

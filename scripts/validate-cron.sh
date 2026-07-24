#!/bin/bash
# Cron wrapper for VLM batch validation
# Logs output to worklog and handles errors gracefully

PROJECT_DIR="/home/z/champion-toffees-competition"
SCRIPT="$PROJECT_DIR/scripts/validate-pending-entries.mjs"
LOG_FILE="$PROJECT_DIR/scripts/validation-cron.log"

echo "=== Cron trigger: $(date -u) ===" >> "$LOG_FILE"

# Run the validation script
cd "$PROJECT_DIR"
node "$SCRIPT" --limit=50 2>&1 | tee -a "$LOG_FILE"

# Check exit code
EXIT_CODE=${PIPESTATUS[0]}
if [ $EXIT_CODE -ne 0 ]; then
  echo "ERROR: Validation script failed with exit code $EXIT_CODE at $(date -u)" >> "$LOG_FILE"
else
  echo "SUCCESS: Validation completed at $(date -u)" >> "$LOG_FILE"
fi

#!/bin/bash
# Start/stop/restart the VLM validation scheduler
# Usage: ./scripts/scheduler-control.sh start|stop|restart|status

PROJECT_DIR="/home/z/champion-toffees-competition"
SCRIPT="$PROJECT_DIR/scripts/validate-scheduler.mjs"
LOG="$PROJECT_DIR/scripts/validation-scheduler.log"

case "$1" in
  start)
    # Kill any existing scheduler first
    pkill -f "validate-scheduler.mjs" 2>/dev/null || true
    sleep 1
    cd "$PROJECT_DIR"
    node "$SCRIPT" --interval=30 &
    disown
    sleep 3
    echo "Scheduler started. PID: $(pgrep -f 'validate-scheduler.mjs')"
    ;;
  stop)
    pkill -f "validate-scheduler.mjs" 2>/dev/null || true
    echo "Scheduler stopped."
    ;;
  restart)
    $0 stop
    sleep 2
    $0 start
    ;;
  status)
    PID=$(pgrep -f 'validate-scheduler.mjs')
    if [ -n "$PID" ]; then
      echo "✅ Scheduler is RUNNING (PID: $PID)"
      echo "Last 5 log entries:"
      tail -5 "$LOG" 2>/dev/null || echo "No log file found"
    else
      echo "❌ Scheduler is NOT running"
      echo "Start it with: ./scripts/scheduler-control.sh start"
    fi
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status}"
    exit 1
    ;;
esac

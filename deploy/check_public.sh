#!/bin/sh
# Task SEC3: run from a machine outside the server, after the deploy.
#   sh deploy/check_public.sh feeguard.example.uz > docs/evidence/sec3-public-check.txt
# Prints the security headers, then tries the backend and Ollama ports, which must be closed.
set -u
HOST="${1:?give the public domain name}"

echo "== $(date -u +%Y-%m-%dT%H:%M:%SZ) · https://$HOST"
echo "== Headers of the start page"
curl -sS -o /dev/null -D - "https://$HOST/" | grep -iE '^(HTTP|strict-transport|x-content-type|x-frame|referrer-policy|permissions-policy|content-security|cross-origin-opener|server)'
echo "== /api/health"
curl -sS "https://$HOST/api/health"; echo
echo "== Plain HTTP must redirect to HTTPS"
curl -sS -o /dev/null -w '%{http_code} -> %{redirect_url}\n' "http://$HOST/"
for PORT in 8000 11434; do
  echo "== Port $PORT must be closed from outside"
  if curl -sS --max-time 5 -o /dev/null "http://$HOST:$PORT/" 2>/dev/null; then
    echo "OPEN: port $PORT answered. Remove its 'ports:' entry in docker-compose.yml."
  else
    echo "closed (no answer within 5 s)"
  fi
done

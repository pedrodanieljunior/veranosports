#!/bin/bash
set -e

npm install

# drizzle-kit push com --force para pular confirmações interativas
# (stdin é fechado no ambiente de pós-merge, então prompts travam)
npm run db:push -- --force

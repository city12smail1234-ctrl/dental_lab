// Vercel function: serves the whole NestJS API (compiled by `npm run build` into ./dist).
const { default: handler } = require('../dist/serverless');
module.exports = handler;

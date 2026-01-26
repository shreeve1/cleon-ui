import { Server } from './server';

const server = new Server();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  server.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down...');
  server.stop();
  process.exit(0);
});

server.start();

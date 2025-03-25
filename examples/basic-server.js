/**
 * Basic example of using QuantumView for browser streaming with Playwright
 */
const { createQuantumStream } = require('../dist');

// Create a quantum stream server
async function startServer() {
  console.log('Starting QuantumView streaming server...');
  
  const stream = await createQuantumStream('https://example.com', {
    port: 8080,
    interval: 500,
    headless: false
  });
  
  console.log('Server started! Connect with a client to view the stream.');
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    await stream.close();
    process.exit(0);
  });
}

startServer().catch(error => {
  console.error('Error starting server:', error);
  process.exit(1);
}); 
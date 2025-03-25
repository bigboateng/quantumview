const { createQuantumStream } = require('../dist');

async function startTestServer() {
  console.log('Starting QuantumView test server...');
  
  // Create a quantum stream server pointing to a test page
  const stream = await createQuantumStream('https://example.com', {
    port: 8080,
    interval: 500,
    headless: false // Set to true if you don't want to see the browser
  });
  
  console.log('Server started! Open test-client.html in your browser to view the stream.');
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    await stream.close();
    process.exit(0);
  });
}

startTestServer().catch(error => {
  console.error('Error starting server:', error);
  process.exit(1);
}); 